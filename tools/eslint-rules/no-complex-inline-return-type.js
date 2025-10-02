/**
 * @fileoverview Enforce extracting complex inline return types to named types
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce extracting inline object return types with more than N properties to named types',
      category: 'Stylistic Issues',
      recommended: false,
    },
    messages: {
      extractReturnType:
        'Extract inline return type with {{count}} properties to a named type (threshold: {{threshold}})',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxProperties: {
            type: 'integer',
            minimum: 1,
            default: 2,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const maxProperties = options.maxProperties || 2;

    /**
     * Check if a node has a return type annotation that is an inline object type
     * @param {import('estree').Node} node
     */
    function checkFunctionReturnType(node) {
      // TypeScript AST nodes
      if (!node.returnType) return;

      const returnTypeAnnotation = node.returnType;

      // returnType is TSTypeAnnotation, which has a typeAnnotation property
      if (returnTypeAnnotation.type !== 'TSTypeAnnotation') return;

      const actualType = returnTypeAnnotation.typeAnnotation;

      // Check if it's an inline object type (TSTypeLiteral)
      if (actualType.type !== 'TSTypeLiteral') return;

      const members = actualType.members || [];

      if (members.length > maxProperties) {
        context.report({
          node: actualType,
          messageId: 'extractReturnType',
          data: {
            count: members.length,
            threshold: maxProperties,
          },
        });
      }
    }

    return {
      FunctionDeclaration: checkFunctionReturnType,
      FunctionExpression: checkFunctionReturnType,
      ArrowFunctionExpression: checkFunctionReturnType,
      TSMethodSignature: checkFunctionReturnType,
      TSDeclareFunction: checkFunctionReturnType,
    };
  },
};
