import ts from "typescript";
import {
  Declaration,
  EmitEntity,
  EmittedSourceFile,
  SourceFile,
  TypeEmitter,
} from "@typespec/compiler/emitter-framework";
import {
  IntrinsicType,
  Model,
  ModelProperty,
  Scalar,
  Type,
  Union,
  compilerAssert,
  emitFile
} from "@typespec/compiler";
import { builder, extractValue } from "./builder.js";

const factory = ts.factory;

// sorted according to the SyntaxKind enum
export type TsNode =
  | ts.QuestionToken
  | ts.Identifier
  | ts.KeywordTypeNode
  | ts.PropertySignature
  | ts.IndexSignatureDeclaration
  | ts.TypeReferenceNode
  | ts.TypeLiteralNode
  | ts.ArrayTypeNode
  | ts.UnionTypeNode
  | ts.IntersectionTypeNode
  | ts.LiteralTypeNode
  | ts.TypeAliasDeclaration;

export class Emitter extends TypeEmitter<TsNode> {
  modelDeclaration(model: Model) {
    let typeEmitted = this.emitter.emitModelProperties(model);

    // if the model extends another model, create an intersection type
    if (model.baseModel) {
      const baseModelEmitted = this.emitter.emitTypeReference(model.baseModel);

      const intersectionType = builder(
        (arg) => {
          const types: ts.TypeNode[] = [];
          for (const tsNode of arg) {
            compilerAssert(ts.isTypeNode(tsNode), "modelDeclaration: expected TypeNode, but received something else");
            types.push(tsNode);
          }
          return factory.createIntersectionTypeNode(types);
        },
        [baseModelEmitted, typeEmitted],
      );

      typeEmitted = this.emitter.result.rawCode(intersectionType);
    }

    const tsNode = builder(
      (argList) => {
        const type = argList[0];
        compilerAssert(ts.isTypeNode(type), "modelDeclaration: expected TypeNode, but received something else");
        return factory.createTypeAliasDeclaration(
          undefined,
          factory.createIdentifier(model.name),
          undefined,
          type,
        );
      },
      [typeEmitted],
    );
    return this.emitter.result.declaration(model.name, tsNode);
  }

  modelProperties(model: Model) {
    const membersEmitted: EmitEntity<TsNode>[] = [];

    for (const [, property] of model.properties) {
      membersEmitted.push(this.emitter.emitType(property));
    }

    // for additional properties
    if (model.indexer) {
      const indexSignature = builder(
        (argList) => {
          const type = argList[0];
          compilerAssert(ts.isTypeNode(type), "modelProperties: expected TypeNode, but received something else");

          // parameters is fixed to [K: string]
          const parameters: ts.ParameterDeclaration[] = [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("K"),
              undefined,
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              undefined,
            ),
          ];

          return factory.createIndexSignature(undefined, parameters, type);
        },
        [this.emitter.emitTypeReference(model.indexer.value)],
      );
      membersEmitted.push(this.emitter.result.rawCode(indexSignature));
    }

    return builder(
      (arg) => {
        const members: ts.TypeElement[] = [];
        for (const tsNode of arg) {
          compilerAssert(ts.isTypeElement(tsNode), "expected TypeElement, but received something else");
          members.push(tsNode);
        }
        return factory.createTypeLiteralNode(members);
      },
      membersEmitted,
    )
  }

  modelPropertyLiteral(property: ModelProperty) {
    const questionToken = property.optional
      ? factory.createToken(ts.SyntaxKind.QuestionToken)
      : undefined;

    return builder(
      (argList) => {
        const type = argList[0];
        compilerAssert(ts.isTypeNode(type), "modelPropertyLiteral: expected TypeNode, but received something else");
        return factory.createPropertySignature(
          undefined,
          factory.createIdentifier(property.name),
          questionToken,
          type,
        );
      },
      [this.emitter.emitTypeReference(property.type)],
    );
  }

  unionLiteral(union: Union) {
    const typesEmitted: EmitEntity<TsNode>[] = [];
    for (const variant of union.variants.values()) {
      typesEmitted.push(this.emitter.emitTypeReference(variant.type));
    }

    return builder(
      (arg) => {
        const types: ts.TypeNode[] = [];
        for (const tsNode of arg) {
          compilerAssert(ts.isTypeNode(tsNode), "unionLiteral: expected TypeNode, but received something else");
          types.push(tsNode);
        }
        return factory.createUnionTypeNode(types);
      },
      typesEmitted,
    );
  }

  arrayLiteral(_: Model, elementType: Type) {
    return builder(
      (argList) => {
        const type = argList[0];
        compilerAssert(ts.isTypeNode(type), "arrayLiteral: expected TypeNode, but received something else");
        return factory.createArrayTypeNode(type);
      },
      [this.emitter.emitTypeReference(elementType)],
    );
  }

  intrinsic(intrinsic: IntrinsicType) {
    switch (intrinsic.name) {
      case "null":
        return factory.createLiteralTypeNode(factory.createNull());
      default:
        compilerAssert(false, `unsupported intrinsic type: ${intrinsic.name}`);
    }
  }

  scalarDeclaration(scalar: Scalar) {
    switch (scalar.name) {
      case "uint8":
      case "uint16":
      case "uint32":
      case "uint64":
      case "int8":
      case "int16":
      case "int32":
      case "int64":
      case "safeint":
      case "integer":
      case "float32":
      case "float64":
      case "float":
      case "numeric":
        return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
      case "decimal128":
      case "decimal":
      case "bytes":
      case "string":
      case "url":
        return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "boolean":
        return factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      default:
        compilerAssert(false, `unsupported built-in scalar type: ${scalar.name}`);
    }
  }

  reference(targetDeclaration: Declaration<TsNode>) {
    // To deal with circular references, you must not utilize targetDeclaration.value.
    return factory.createTypeReferenceNode(targetDeclaration.name, undefined);
  }

  programContext() {
    const sourceFile = this.emitter.createSourceFile("models.ts");
    return { scope: sourceFile.globalScope };
  }

  sourceFile(sourceFile: SourceFile<TsNode>): EmittedSourceFile {
    const decls = sourceFile.globalScope.declarations;

    const statements: ts.Statement[] = [];
    for (const decl of decls) {
      const tsNode = extractValue(decl);
      compilerAssert(ts.isStatement(tsNode), "sourceFile: expected Statement, but received something else");
      statements.push(tsNode);
    }

    const printer = ts.createPrinter();
    const tsSourceFile = factory.createSourceFile(
      statements,
      factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );
    const contents = printer.printFile(tsSourceFile);

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
