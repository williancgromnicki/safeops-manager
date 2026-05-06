export type SoftwareItem = {
  key: string;
  label: string;
  packageName: string;
  category: string;
  installCmd: string;
  validateCmd?: string;
  timeout: number;
  attentionNote?: string;
};

export const SOFTWARE_WHITELIST: SoftwareItem[] = [
  {
    key: "7zip",
    label: "7-Zip",
    packageName: "7zip.install",
    category: "Compactadores",
    installCmd: "choco install 7zip.install -y --no-progress",
    validateCmd:
      'if exist "C:\\Program Files\\7-Zip\\7z.exe" (echo INSTALLED) else (echo NOT_FOUND)',
    timeout: 600,
  },
  {
    key: "winrar",
    label: "WinRAR",
    packageName: "winrar",
    category: "Compactadores",
    installCmd: "choco install winrar -y --no-progress",
    validateCmd:
      'if exist "C:\\Program Files\\WinRAR\\WinRAR.exe" (echo INSTALLED) else (echo NOT_FOUND)',
    timeout: 600,
  },
  {
    key: "adobereader",
    label: "Adobe Acrobat Reader",
    packageName: "adobereader",
    category: "PDF",
    installCmd: "choco install adobereader -y --no-progress",
    validateCmd:
      'if exist "C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe" (echo INSTALLED) else (if exist "C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe" (echo INSTALLED) else (echo NOT_FOUND))',
    timeout: 900,
  },
  {
    key: "javaruntime",
    label: "Java Runtime",
    packageName: "javaruntime",
    category: "Runtime",
    installCmd: "choco install javaruntime -y --no-progress",
    validateCmd: "java -version",
    timeout: 900,
    attentionNote:
      "Atenção: instalar Java apenas quando houver necessidade de sistema legado, ERP, emissor fiscal ou aplicação específica.",
  },
  {
    key: "vcredist-all",
    label: "Microsoft Visual C++ Redistributable",
    packageName: "vcredist-all",
    category: "Runtime",
    installCmd: "choco install vcredist-all -y --no-progress",
    validateCmd:
      'reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Installed',
    timeout: 900,
  },
  {
    key: "office365",
    label: "Microsoft Office 365 Apps",
    packageName: "Office365ProPlus",
    category: "Produtividade",
    installCmd: "choco install Office365ProPlus -y --no-progress",
    validateCmd:
      'if exist "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" (echo INSTALLED) else (echo NOT_FOUND)',
    timeout: 2400,
    attentionNote:
      "Atenção: instalação do Office pode ser demorada e depender de idioma, canal, licenciamento e política do cliente.",
  },
  {
    key: "onedrive",
    label: "Microsoft OneDrive",
    packageName: "onedrive",
    category: "Produtividade",
    installCmd: "choco install onedrive -y --no-progress",
    validateCmd:
      'if exist "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" (echo INSTALLED) else (if exist "%LOCALAPPDATA%\\Microsoft\\OneDrive\\OneDrive.exe" (echo INSTALLED) else (echo NOT_FOUND))',
    timeout: 900,
    attentionNote:
      "Atenção: OneDrive pode ter comportamento diferente por usuário ou por máquina.",
  },
];

export function getSoftwareByKey(key: string) {
  return SOFTWARE_WHITELIST.find((item) => item.key === key);
}
