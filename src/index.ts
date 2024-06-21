import { EmitContext } from "@typespec/compiler";
import { Emitter } from "./emitter.js";

export { $lib } from "./lib.js";

export async function $onEmit(context: EmitContext) {
  const assetEmitter = context.getAssetEmitter(Emitter);
  assetEmitter.emitProgram();
  assetEmitter.writeOutput();
}
