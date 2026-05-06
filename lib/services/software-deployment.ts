import { getSoftwareByKey } from "@/lib/software-whitelist";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TRMM_API_URL = process.env.TRMM_API_URL;
const TRMM_API_KEY = process.env.TRMM_API_KEY;

type InstallSoftwareInput = {
  agentId: string;
  softwareKey: string;
  requestedBy?: string | null;
};

function classifyInstallResult(output: string) {
  const normalized = output.toLowerCase();

  if (
    normalized.includes("installed 1/1 packages") ||
    (normalized.includes("the install of") &&
      normalized.includes("was successful"))
  ) {
    return "success";
  }

  if (normalized.includes("already installed")) {
    return "already_installed";
  }

  if (
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

async function runTrmmCommand(agentId: string, cmd: string, timeout: number) {
  if (!TRMM_API_URL || !TRMM_API_KEY) {
    throw new Error("TRMM_API_URL ou TRMM_API_KEY não configurados.");
  }

  const response = await fetch(`${TRMM_API_URL}/agents/${agentId}/cmd/`, {
    method: "POST",
    headers: {
      "X-API-KEY": TRMM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shell: "cmd",
      cmd,
      timeout,
      custom_shell: null,
      run_as_user: false,
    }),
  });

  const text = await response.text();

  let output = text;

  try {
    output = JSON.parse(text);
  } catch {
    // Mantém texto bruto caso não seja JSON válido.
  }

  return {
    ok: response.ok,
    status: response.status,
    output: String(output),
  };
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
    const installResult = await runTrmmCommand(
      input.agentId,
      software.installCmd,
      software.timeout
    );

    const installStatus = classifyInstallResult(installResult.output);

    let validationResult: {
      ok: boolean;
      status: number;
      output: string;
    } | null = null;

    if (software.validateCmd) {
      validationResult = await runTrmmCommand(
        input.agentId,
        software.validateCmd,
        60
      );
    }

    const finalStatus = classifyFinalResult(
      installStatus,
      validationResult?.output
    );

    const { error: updateJobError } = await supabaseAdmin
      .from("software_install_jobs")
      .update({
        status: finalStatus,
        install_output: installResult.output,
        validation_output: validationResult?.output ?? null,
        error_message:
          finalStatus === "failed"
            ? "A instalação ou validação retornou falha."
            : null,
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
