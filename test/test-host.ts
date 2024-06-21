import { Diagnostic, resolvePath } from "@typespec/compiler";
import {
  createTestHost,
  createTestWrapper,
  expectDiagnosticEmpty,
} from "@typespec/compiler/testing";
import { TsptsTestLibrary } from "../src/testing/index.js";

export async function createTsptsTestHost() {
  return createTestHost({
    libraries: [TsptsTestLibrary],
  });
}

export async function createTsptsTestRunner() {
  const host = await createTsptsTestHost();

  return createTestWrapper(host, {
    compilerOptions: {
      noEmit: false,
      emit: ["tspts"],
    },
  });
}

export async function emitWithDiagnostics(
  code: string
): Promise<[Record<string, string>, readonly Diagnostic[]]> {
  const runner = await createTsptsTestRunner();
  await runner.compileAndDiagnose(code, {
    outputDir: "tsp-output",
  });
  const emitterOutputDir = "./tsp-output/tspts";
  const files = await runner.program.host.readDir(emitterOutputDir);

  const result: Record<string, string> = {};
  for (const file of files) {
    result[file] = (await runner.program.host.readFile(resolvePath(emitterOutputDir, file))).text;
  }
  return [result, runner.program.diagnostics];
}

export async function emit(code: string): Promise<Record<string, string>> {
  const [result, diagnostics] = await emitWithDiagnostics(code);
  expectDiagnosticEmpty(diagnostics);
  return result;
}
