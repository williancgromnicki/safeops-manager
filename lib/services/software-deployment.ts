import { getSoftwareByKey } from "@/lib/software-whitelist";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TRMM_API_URL = process.env.TRMM_API_URL;
const TRMM_API_KEY = process.env.TRMM_API_KEY;

type InstallSoftwareInput = {
  agentId: string;
  softwareKey: string;
  requestedBy?: string | null;
};

type RemoteCommandResult = {
  ok: boolean;
  status: number;
  output: string;
};

type ChocolateyEnsureResult = {
  ok: boolean;
  repaired: boolean;
  check: RemoteCommandResult;
  repair?: RemoteCommandResult;
  validation?: RemoteCommandResult;
};

const CHOCOLATEY_EXE = '"%ProgramData%\\chocolatey\\bin\\choco.exe"';

const CHOCOLATEY_CHECK_CMD =
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = \'Continue\'; $paths = @(); if ($env:ChocolateyInstall) { $paths += (Join-Path $env:ChocolateyInstall \'bin\\choco.exe\') }; $paths += (Join-Path $env:ProgramData \'chocolatey\\bin\\choco.exe\'); $cmd = Get-Command choco.exe -ErrorAction SilentlyContinue; if ($cmd) { $paths = @($cmd.Source) + $paths }; $exe = $paths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; if (-not $exe) { Write-Output \'CHOCO_NOT_FOUND\'; exit 0 }; Write-Output (\'CHOCO_EXE=\' + $exe); & $exe --version; if ($LASTEXITCODE -eq 0) { Write-Output \'CHOCO_READY\' } else { Write-Output \'CHOCO_BROKEN\'; exit 0 }"';

const CHOCOLATEY_REPAIR_CMD =
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = \'Stop\'; $chocoRoot = Join-Path $env:ProgramData \'chocolatey\'; if (Test-Path $chocoRoot) { $backup = $chocoRoot + \'.broken-\' + (Get-Date -Format \'yyyyMMddHHmmss\'); Move-Item -Path $chocoRoot -Destination $backup -Force; Write-Output (\'CHOCO_BACKUP=\' + $backup) }; [Environment]::SetEnvironmentVariable(\'ChocolateyInstall\', $null, \'Machine\'); $env:ChocolateyInstall = $null; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString(\'https://community.chocolatey.org/install.ps1\')); $exe = Join-Path $env:ProgramData \'chocolatey\\bin\\choco.exe\'; if (-not (Test-Path $exe)) { Write-Output \'CHOCO_NOT_FOUND_AFTER_REPAIR\'; exit 1 }; & $exe --version; if ($LASTEXITCODE -eq 0) { Write-Output \'CHOCO_READY\' } else { Write-Output \'CHOCO_NOT_READY_AFTER_REPAIR\'; exit 1 }"';

function getTrmmBaseUrl(): string {
  if (!TRMM_API_URL) {
    throw new Error("URL da API de execução remota não configurada.");
  }

  return TRMM_API_URL.replace(/\/+$/, "");
}

function getTrmmApiKey(): string {
  if (!TRMM_API_KEY) {
    throw new Error("Chave da API de execução remota não configurada.");
  }

  return TRMM_API_KEY;
}

function extractCommandOutput(bodyText: string): string {
  if (!bodyText) {
    return "";
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;

    if (typeof parsed === "string") {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;

      const preferredFields = [
        "output",
        "stdout",
        "stderr",
        "result",
        "detail",
        "message",
        "error",
      ];

      const parts: string[] = [];

      for (const field of preferredFields) {
        const value = record[field];

        if (typeof value === "string" && value.trim()) {
          parts.push(value);
        }
      }

      if (parts.length > 0) {
        return parts.join("\n");
      }

      return JSON.stringify(parsed);
    }
  } catch {
    // Mantém texto bruto caso não seja JSON válido.
  }

  return bodyText;
}

function classifyInstallResult(output: string) {
  const normalized = output.toLowerCase();

  if (
    normalized.includes("installed 1/1 packages") ||
    normalized.includes("installed 1 packages") ||
    (normalized.includes("the install of") &&
      normalized.includes("was successful")) ||
    normalized.includes("software installed successfully")
  ) {
    return "success";
  }

  if (
    normalized.includes("already installed") ||
    normalized.includes("already is installed") ||
    normalized.includes("is already installed")
  ) {
    return "already_installed";
  }

  if (
    normalized.includes("not recognized as an internal or external command") ||
    normalized.includes("não é reconhecido como um comando interno") ||
    normalized.includes("no  reconhecido como um comando interno") ||
    normalized.includes("not installed") ||
    normalized.includes("failed") ||
    normalized.includes("error")
  ) {
    return "failed";
  }

  return "unknown";
}

function classifyFinalResult(
  installStatus: string,
  validationOutput?: string | null
) {
  const normalizedValidation = (validationOutput ?? "").toLowerCase();

  if (normalizedValidation.includes("installed")) {
    return installStatus === "already_installed"
      ? "already_installed"
      : "success";
  }

  if (normalizedValidation.includes("not_found")) {
    return installStatus === "already_installed" ? "failed" : installStatus;
  }

  return installStatus;
}

function isChocolateyReady(output: string): boolean {
  const normalized = output.toLowerCase();

  if (
    normalized.includes("choco_not_found") ||
    normalized.includes("choco_broken") ||
    normalized.includes("not_found_after_repair") ||
    normalized.includes("not_ready_after_repair") ||
    normalized.includes("loaderexceptions") ||
    normalized.includes("existing chocolatey installation was detected") ||
    normalized.includes("previous installation of chocolatey")
  ) {
    return false;
  }

  return (
    normalized.includes("choco_ready") ||
    normalized.includes("chocolatey v") ||
    /^\s*\d+\.\d+\.\d+/m.test(output)
  );
}

function usesChocolatey(command: string): boolean {
  return /^choco(\.exe)?\s+/i.test(command.trim());
}

function forceChocolateyFullPath(command: string): string {
  return command.trim().replace(/^choco(\.exe)?\s+/i, `${CHOCOLATEY_EXE} `);
}

async function runTrmmCommand(
  agentId: string,
  cmd: string,
  timeout: number
): Promise<RemoteCommandResult> {
  const response = await fetch(`${getTrmmBaseUrl()}/agents/${agentId}/cmd/`, {
    method: "POST",
    headers: {
      "X-API-Key": getTrmmApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      shell: "cmd",
      cmd,
      timeout,
      custom_shell: null,
      run_as_user: false,
    }),
  });

  const bodyText = await response.text();
  const output = extractCommandOutput(bodyText);

  return {
    ok: response.ok,
    status: response.status,
    output,
  };
}

async function ensureChocolatey(agentId: string): Promise<ChocolateyEnsureResult> {
  const check = await runTrmmCommand(agentId, CHOCOLATEY_CHECK_CMD, 90);

  if (check.ok && isChocolateyReady(check.output)) {
    return {
      ok: true,
      repaired: false,
      check,
    };
  }

  const repair = await runTrmmCommand(agentId, CHOCOLATEY_REPAIR_CMD, 900);
  const validation = await runTrmmCommand(agentId, CHOCOLATEY_CHECK_CMD, 90);

  const ok =
    validation.ok &&
    isChocolateyReady(validation.output) &&
    !validation.output.toLowerCase().includes("choco_not_found");

  return {
    ok,
    repaired: ok,
    check,
    repair,
    validation,
  };
}

function buildErrorMessage(input: {
  finalStatus: string;
  installOutput: string;
  chocolatey?: ChocolateyEnsureResult | null;
}): string | null {
  if (input.finalStatus !== "failed") {
    return null;
  }

  const normalizedInstallOutput = input.installOutput.toLowerCase();

  if (
    normalizedInstallOutput.includes("not recognized as an internal or external command") ||
    normalizedInstallOutput.includes("não é reconhecido como um comando interno") ||
    normalizedInstallOutput.includes("no  reconhecido como um comando interno")
  ) {
    return "O Chocolatey não estava disponível no dispositivo durante a instalação.";
  }

  if (input.chocolatey && !input.chocolatey.ok) {
    return "Não foi possível preparar ou reparar o Chocolatey no dispositivo antes da instalação.";
  }

  return "A instalação ou validação retornou falha.";
}

export async function installSoftwareOnAgent(input: InstallSoftwareInput) {
  let jobId: string | null = null;

  const software = getSoftwareByKey(input.softwareKey);

  if (!software) {
    throw new Error("Software não permitido na whitelist.");
  }

  const { data: createdJob, error: createJobError } = await supabaseAdmin
    .from("software_install_jobs")
    .insert({
      agent_id: input.agentId,
      software_key: software.key,
      software_label: software.label,
      package_name: software.packageName,
      status: "running",
      requested_by: input.requestedBy ?? null,
    })
    .select("id")
    .single();

  if (createJobError) {
    throw new Error(
      `Erro ao criar registro da instalação: ${createJobError.message}`
    );
  }

  jobId = createdJob.id;

  try {
    let chocolateyResult: ChocolateyEnsureResult | null = null;

    if (usesChocolatey(software.installCmd)) {
      chocolateyResult = await ensureChocolatey(input.agentId);

      if (!chocolateyResult.ok) {
        const output = [
          "=== Chocolatey precheck ===",
          chocolateyResult.check.output,
          chocolateyResult.repair
            ? "\n=== Chocolatey repair/bootstrap ===\n" +
              chocolateyResult.repair.output
            : "",
          chocolateyResult.validation
            ? "\n=== Chocolatey validation ===\n" +
              chocolateyResult.validation.output
            : "",
        ]
          .filter(Boolean)
          .join("\n")
          .trim();

        throw new Error(
          `Não foi possível preparar ou reparar o Chocolatey no dispositivo. ${output}`.trim()
        );
      }
    }

    const installCommand = usesChocolatey(software.installCmd)
      ? forceChocolateyFullPath(software.installCmd)
      : software.installCmd;

    const installResult = await runTrmmCommand(
      input.agentId,
      installCommand,
      software.timeout
    );

    const installStatus = classifyInstallResult(installResult.output);

    let validationResult: RemoteCommandResult | null = null;

    if (software.validateCmd) {
      validationResult = await runTrmmCommand(
        input.agentId,
        software.validateCmd,
        90
      );
    }

    const finalStatus = classifyFinalResult(
      installStatus,
      validationResult?.output
    );

    const errorMessage = buildErrorMessage({
      finalStatus,
      installOutput: installResult.output,
      chocolatey: chocolateyResult,
    });

    const combinedInstallOutput = [
      chocolateyResult
        ? [
            "=== Chocolatey precheck ===",
            chocolateyResult.check.output,
            chocolateyResult.repair
              ? "\n=== Chocolatey repair/bootstrap ===\n" +
                chocolateyResult.repair.output
              : "",
            chocolateyResult.validation
              ? "\n=== Chocolatey validation ===\n" +
                chocolateyResult.validation.output
              : "",
          ].join("\n")
        : null,
      "\n=== Software install ===",
      installResult.output,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const { error: updateJobError } = await supabaseAdmin
      .from("software_install_jobs")
      .update({
        status: finalStatus,
        install_output: combinedInstallOutput,
        validation_output: validationResult?.output ?? null,
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateJobError) {
      throw new Error(
        `Instalação executada, mas houve erro ao atualizar o histórico: ${updateJobError.message}`
      );
    }

    return {
      ok: finalStatus === "success" || finalStatus === "already_installed",
      job_id: jobId,
      status: finalStatus,
      software: {
        key: software.key,
        label: software.label,
        packageName: software.packageName,
      },
      install: installResult,
      validation: validationResult,
      chocolatey: chocolateyResult
        ? {
            ok: chocolateyResult.ok,
            repaired: chocolateyResult.repaired,
            check: chocolateyResult.check,
            repair: chocolateyResult.repair,
            validation: chocolateyResult.validation,
          }
        : null,
    };
  } catch (error) {
    await supabaseAdmin
      .from("software_install_jobs")
      .update({
        status: "failed",
        error_message:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao instalar software.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    throw error;
  }
}
