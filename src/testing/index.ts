import {
  createTestLibrary,
  findTestPackageRoot,
  TypeSpecTestLibrary,
} from "@typespec/compiler/testing";

export const TsptsTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "tspts",
  packageRoot: await findTestPackageRoot(import.meta.url),
});
