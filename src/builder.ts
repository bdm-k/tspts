import ts from "typescript";
import {
  Declaration,
  EmitEntity,
  Placeholder,
  RawCode
} from "@typespec/compiler/emitter-framework";
import { compilerAssert } from "@typespec/compiler";
import { TsNode } from "./emitter.js";

const factory = ts.factory;

// custom placeholder class
class Ph extends Placeholder<TsNode> {
  value: TsNode | undefined;

  constructor() {
    super();
    this.onValue((value: TsNode) => {
      this.value = value;
    });
  }
}

/**
 * Encapsulates the logic for handling placeholders
 *
 * @param buildFun - function to be invoked once all the placeholders have been resolved
 * @param emitEntityList - list of EmitEntity, from which the arguments for the buildFun are generated
 */
export function builder(
  buildFun: (argList: TsNode[]) => TsNode,
  emitEntityList: (EmitEntity<TsNode>)[],
): TsNode | Placeholder<TsNode> {
  let numPlaceholdersRemaining = 0;
  const arg: TsNode[] = [];
  const ph = new Ph();

  for (let i = 0; i < emitEntityList.length; ++i) {
    const emitEntity = emitEntityList[i];
    compilerAssert(emitEntity.kind === "code", `expected RawCode, but received ${emitEntity.kind}`);

    const value = emitEntity.value;

    if (!isPlaceholder(value)) {
      arg.push(value);
    }
    else {
      // push any TsNode object as a dummy
      arg.push(factory.createIdentifier("dummy"));

      // set callback
      const dependentPh = value;
      dependentPh.onValue((tsNode: TsNode) => {
        arg[i] = tsNode;
        numPlaceholdersRemaining -= 1;

        // invokes the buildFun if all the placeholders have been resolved
        if (numPlaceholdersRemaining === 0) {
          ph.setValue(buildFun(arg));
        }
      });

      numPlaceholdersRemaining += 1;
    }
  }

  // If there are no placeholders, immediately invoke the buildFun
  if (numPlaceholdersRemaining === 0) {
    return buildFun(arg);
  }

  return ph;
}

/**
 * Tries to extract the value from a Declaration or RawCode.
 * If the value is a placeholder and it has not been resolved, the compilation
 * will fail.
 */
export function extractValue(
  entity: Declaration<TsNode> | RawCode<TsNode>
): TsNode {
  const value = entity.value;

  if (!isPlaceholder(value)) return value;
  if (value instanceof Ph && value.value) return value.value;

  compilerAssert(false, "couldn't extract value");
}

function isPlaceholder(
  value: TsNode | Placeholder<TsNode>
): value is Placeholder<TsNode> {
  // NOTE: For some reason, `value instanceof Placeholder` doesn't work.
  return "onValue" in value;
}
