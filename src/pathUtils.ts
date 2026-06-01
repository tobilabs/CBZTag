export function parentFolderName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 2] ?? "";
}

export function fileBaseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const name = parts[parts.length - 1] ?? "";
  return name.replace(/\.[^.]+$/, "");
}
