import ts from "typescript";
import {
  Declaration,
  EmitEntity,
  EmittedSourceFile,
  Placeholder,
  RawCode,
  SourceFile,
  TypeEmitter,
} from "@typespec/compiler/emitter-framework";
import {
  Model,
  ModelProperty,
  Scalar,
  compilerAssert,
  emitFile
} from "@typespec/compiler";

const factory = ts.factory;

type TsNode =
  | ts.TypeAliasDeclaration
  | ts.TypeLiteralNode
  | ts.PropertySignature
  | ts.Identifier
  | ts.QuestionToken
  | ts.KeywordTypeNode;

const builder = {
  typeAliasDeclaration(
    modifiers: undefined,
    name: ts.Identifier,
    typeParameters: undefined,
    typeEmitted: EmitEntity<TsNode>,
  ) {
    const type = extractValue(assertRowCode(typeEmitted));
    if (!ts.isTypeNode(type))
      compilerAssert(false, "expected TypeNode, but received something else");

    return factory.createTypeAliasDeclaration(
      modifiers,
      name,
      typeParameters,
      type,
    );
  },

  typeLiteralNode(membersEmitted: EmitEntity<TsNode>[]) {
    const members: ts.TypeElement[] = [];
    for (const mEmitted of membersEmitted) {
      const m = extractValue(assertRowCode(mEmitted));
      if (!ts.isTypeElement(m))
        compilerAssert(false, "expected TypeElement, but received something else");
      members.push(m);
    }
    return factory.createTypeLiteralNode(members);
  },

  propertySignature(
    modifiers: undefined,
    name: ts.Identifier,
    questionToken: undefined,
    typeEmitted: EmitEntity<TsNode>,
  ) {
    const type = extractValue(assertRowCode(typeEmitted));
    if (!ts.isTypeNode(type))
      compilerAssert(false, "expected TypeNode, but received something else");

    return factory.createPropertySignature(
      modifiers,
      name,
      questionToken,
      type
    );
  },
}

export class Emitter extends TypeEmitter<TsNode> {
  programContext() {
    const sourceFile = this.emitter.createSourceFile("models.ts");
    return { scope: sourceFile.globalScope };
  }

  modelDeclaration(model: Model, name: string) {
    const tsNode = builder.typeAliasDeclaration(
      undefined,
      factory.createIdentifier(name),
      undefined,
      this.emitter.emitModelProperties(model),
    );

    return this.emitter.result.declaration(name, tsNode);
  }

  modelProperties(model: Model) {
    const propertyEmittedList: EmitEntity<TsNode>[] = [];
    for (const [, property] of model.properties) {
      propertyEmittedList.push(this.emitter.emitType(property));
    }
    return builder.typeLiteralNode(propertyEmittedList);
  }

  modelPropertyLiteral(property: ModelProperty) {
    return builder.propertySignature(
      undefined,
      factory.createIdentifier(property.name),
      undefined,
      this.emitter.emitType(property.type),
    );
  }

  scalarDeclaration(scalar: Scalar) {
    // TODO: support all built-in scalar types
    switch (scalar.name) {
      case "string":
        return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      default:
        compilerAssert(false, `unknown built-in scalar type: ${scalar.name}`);
    }
  }

  sourceFile(sourceFile: SourceFile<TsNode>): EmittedSourceFile {
    const decls = sourceFile.globalScope.declarations;

    let contents = "";
    if (decls.length > 0) {
      const tsNode = extractValue(decls[0]);
      if (!ts.isStatement(tsNode))
        compilerAssert(false, "expected Statement, but received something else");

      const printer = ts.createPrinter();
      const sourceFile = factory.createSourceFile(
        [tsNode],
        factory.createToken(ts.SyntaxKind.EndOfFileToken),
        ts.NodeFlags.None,
      );
      contents = printer.printFile(sourceFile);
    }

    return {
      path: sourceFile.path,
      contents,
    };
  }

  async writeOutput(sourceFiles: SourceFile<TsNode>[]) {
    for (const sf of sourceFiles) {
      const sfEmitted = await this.emitter.emitSourceFile(sf);
      await emitFile(this.emitter.getProgram(), {
        path: sfEmitted.path,
        content: sfEmitted.contents,
      });
    }
  }
}


/* helper functions from here */

// narrows down the argument's type to RawCode
// If the argument's type is not RawCode, the compilation stops.
function assertRowCode<T>(output: EmitEntity<T>): RawCode<T> {
  if (output.kind !== "code")
    compilerAssert(false, "expected RawCode, but received something else");
  return output;
}

// extracts the value from a Declaration or RawCode
// If the value is a placeholder, the compilation stops.
function extractValue<T>(entity: Declaration<T> | RawCode<T>): T {
  const value = entity.value;
  if (value instanceof Placeholder)
    compilerAssert(false, "cannot extract value from a placeholder");
  return value;
}
