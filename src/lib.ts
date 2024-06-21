import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "tspts",
  diagnostics: {},
});

export const { reportDiagnostic, createDiagnostic } = $lib;
