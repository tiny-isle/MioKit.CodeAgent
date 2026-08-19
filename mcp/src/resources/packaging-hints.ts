export const PACKAGING_HINTS_URI = 'miokit://packaging-hints';

export const PACKAGING_HINTS = {
  layout:
    'nupkg root must contain plugin.json and the entry DLL. This is not a class-library layout under lib/<TFM>/.',
  identities:
    'NuGet PackageId / PackageVersion are the distribution identity and are not plugin.json.id. Keep both stable and unique.',
  version:
    'Do not put pluginVersion, releaseState, or releaseDate in plugin.json. Formal vs prerelease is NuGet PackageVersion only (1.2.0 vs 1.3.0-beta.1).',
  icon:
    'plugin.json.icon is the runtime path; nuspec <icon> / MSBuild PackageIcon must use the same relative path. Mark the file CopyToOutputDirectory + Pack.',
  pack:
    'Use pack_plugin (dotnet pack). Do not hand-build a zip. Do not nuget push from MCP.',
  hostDlls:
    'Never pack MioKit.Sdk.dll, MioKit.SourceGenerate.dll, or MioKit.Webview2.dll; the host already provides them.',
} as const;
