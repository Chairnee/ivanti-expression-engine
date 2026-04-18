const ExpressionEngine = (function () {
	const Result = {
		ok: function (value) {
			return { ok: true, value: value };
		},
		fail: function (message, value) {
			return { ok: false, error: message, value: value };
		},
		isOk: function (r) {
			return r && r.ok === true;
		},
		isFail: function (r) {
			return r && r.ok === false;
		}
	};

	const MAX_EXPRESSION_LENGTH = 2000;
	const MAX_TOKEN_COUNT = 512;
	const MAX_NESTING_DEPTH = 64;
	const MAX_CALL_ARGUMENTS = 8;
	const MAX_LIST_ITEMS = 16;

	const FIELD_TYPES = {
		bool: true,
		str: true,
		num: true
	};

	const FIELD_SOURCES = {
		srp: true,
		local: true
	};

	function evaluateExpression(rawExpr, context) {
		const result = tryEvaluateExpression(rawExpr, context);

		if (Result.isFail(result)) {
			throw new Error(result.error);
		}

		return result.value;
	}

	function tryEvaluate(rawValue, context) {
		const taggedResult = extractTaggedExpression(rawValue);

		if (Result.isFail(taggedResult)) {
			return taggedResult;
		}

		if (!taggedResult.value.isTagged) {
			return Result.ok(rawValue);
		}

		return tryEvaluateExpression(taggedResult.value.expression, context);
	}

	function tryEvaluateExpression(rawExpr, context) {
		const expr = unwrapExpression(rawExpr);
		let tokenResult;
		let parser;
		let ast;
		let evaluationResult;

		tokenResult = tokenise(expr);
		if (Result.isFail(tokenResult)) {
			return Result.fail(addExpressionContext(tokenResult.error, expr));
		}

		parser = createParser(tokenResult.value, expr);
		ast = parseExpression(parser);
		if (parser.error) {
			return Result.fail(addExpressionContext(parser.error, expr));
		}

		evaluationResult = evaluate(ast, context);
		if (Result.isFail(evaluationResult)) {
			return Result.fail(addExpressionContext(evaluationResult.error, expr));
		}

		return evaluationResult;
	}

	function unwrapExpression(expr) {
		if (
			typeof expr === "string" &&
			expr.indexOf("{{") === 0 &&
			expr.slice(-2) === "}}"
		) {
			return expr.slice(2, -2);
		}
		return expr;
	}

	function extractTaggedExpression(rawValue) {
		let trimmedValue;
		let firstOpenIndex;
		let firstCloseIndex;
		let lastOpenIndex;
		let lastCloseIndex;

		if (typeof rawValue !== "string") {
			return Result.ok({
				isTagged: false
			});
		}

		trimmedValue = rawValue.trim();
		firstOpenIndex = trimmedValue.indexOf("{{");
		firstCloseIndex = trimmedValue.indexOf("}}");

		if (firstOpenIndex === -1 && firstCloseIndex === -1) {
			return Result.ok({
				isTagged: false
			});
		}

		if (firstOpenIndex === -1 || firstCloseIndex === -1) {
			return Result.fail("Malformed expression tag");
		}

		lastOpenIndex = trimmedValue.lastIndexOf("{{");
		lastCloseIndex = trimmedValue.lastIndexOf("}}");

		if (
			firstOpenIndex !== 0 ||
			lastCloseIndex !== trimmedValue.length - 2 ||
			lastOpenIndex !== firstOpenIndex ||
			firstCloseIndex !== lastCloseIndex ||
			firstCloseIndex < firstOpenIndex
		) {
			return Result.fail("Malformed expression tag");
		}

		return Result.ok({
			isTagged: true,
			expression: trimmedValue
		});
	}

	function isWhitespace(char) {
		return char === " " || char === "\t" || char === "\n" || char === "\r";
	}

	function isDigit(char) {
		return char >= "0" && char <= "9";
	}

	function isIdentifierStart(char) {
		return (
			(char >= "a" && char <= "z") ||
			(char >= "A" && char <= "Z") ||
			char === "_"
		);
	}

	function isIdentifierPart(char) {
		return isIdentifierStart(char) || isDigit(char);
	}

	function hasField(source, object, key) {
		if (!object) {
			return false;
		}

		if (source === "srp") {
			return (
				typeof object.hasOwnProperty === "function" &&
				object.hasOwnProperty(key)
			);
		}

		if (source === "local") {
			return key in object;
		}

		return false;
	}

	function createSyntaxErrorMessage(input, index, message) {
		return message + " at index " + index + " of \n" + input;
	}

	function addExpressionContext(message, expr) {
		return message + "\nExpression: " + expr;
	}

	function createToken(type, start, value, raw) {
		const token = {
			type: type,
			start: start
		};

		if (typeof value !== "undefined") {
			token.value = value;
		}

		if (typeof raw !== "undefined") {
			token.raw = raw;
		}

		return token;
	}

	function createNumberToken(raw, start) {
		return createToken("NUMBER", start, Number(raw), raw);
	}

	function pushToken(tokens, token) {
		tokens.push(token);

		if (tokens.length > MAX_TOKEN_COUNT) {
			return Result.fail(
				"Expression exceeds maximum token count of " + MAX_TOKEN_COUNT
			);
		}

		return Result.ok();
	}

	function pushContext(parser, contexts, kind, token) {
		if (contexts.length >= MAX_NESTING_DEPTH) {
			return parser.fail(
				"Expression nesting exceeds maximum depth of " + MAX_NESTING_DEPTH,
				token
			);
		}

		contexts.push(createExpressionContext(kind));
		return true;
	}

	function tokenise(input) {
		const tokens = [];
		let i = 0;
		let pushResult;
		let pair;
		let value;
		let start;
		let end;

		if (input.length > MAX_EXPRESSION_LENGTH) {
			return Result.fail(
				"Expression exceeds maximum length of " +
					MAX_EXPRESSION_LENGTH +
					" characters"
			);
		}

		while (i < input.length) {
			const char = input[i];

			if (isWhitespace(char)) {
				i++;
				continue;
			}

			pair = input.substr(i, 2);

			if (pair === "&&") {
				pushResult = pushToken(tokens, createToken("AND", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (pair === "||") {
				pushResult = pushToken(tokens, createToken("OR", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (pair === ">=") {
				pushResult = pushToken(tokens, createToken("GTE", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (pair === "<=") {
				pushResult = pushToken(tokens, createToken("LTE", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (pair === "==") {
				pushResult = pushToken(tokens, createToken("EQ", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (pair === "!=") {
				pushResult = pushToken(tokens, createToken("NEQ", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i += 2;
				continue;
			}

			if (char === "!") {
				pushResult = pushToken(tokens, createToken("NOT", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			if (char === ">") {
				pushResult = pushToken(tokens, createToken("GT", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			if (char === "<") {
				pushResult = pushToken(tokens, createToken("LT", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			// Parentheses
			if (char === "(") {
				pushResult = pushToken(tokens, createToken("LPAREN", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			if (char === ")") {
				pushResult = pushToken(tokens, createToken("RPAREN", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			// String
			if (char === "'") {
				value = "";
				start = i + 1;
				end = start;

				while (end < input.length) {
					if (input[end] === "\\") {
						value += input.slice(start, end);
						end++;

						if (end >= input.length) {
							return Result.fail(
								createSyntaxErrorMessage(input, i, "Unterminated string")
							);
						}

						if (input[end] === "'" || input[end] === "\\") {
							value += input[end];
						} else if (input[end] === "n") {
							value += "\n";
						} else if (input[end] === "r") {
							value += "\r";
						} else if (input[end] === "t") {
							value += "\t";
						} else {
							value += input[end];
						}

						end++;
						start = end;
						continue;
					}

					if (input[end] === "'") {
						break;
					}

					end++;
				}

				if (end >= input.length) {
					return Result.fail(
						createSyntaxErrorMessage(input, i, "Unterminated string")
					);
				}

				value += input.slice(start, end);
				pushResult = pushToken(tokens, createToken("STRING", i, value));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}

				i = end + 1;
				continue;
			}

			// Comma
			if (char === ",") {
				pushResult = pushToken(tokens, createToken("COMMA", i));
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				i++;
				continue;
			}

			if (char === "-" && isDigit(input[i + 1])) {
				start = i;
				i++;

				while (i < input.length && isDigit(input[i])) {
					i++;
				}

				if (input[i] === "." && isDigit(input[i + 1])) {
					i++;

					while (i < input.length && isDigit(input[i])) {
						i++;
					}
				}

				pushResult = pushToken(
					tokens,
					createNumberToken(input.slice(start, i), start)
				);
				if (Result.isFail(pushResult)) {
					return pushResult;
				}
				continue;
			}

			if (isDigit(char)) {
				start = i;

				while (i < input.length && isDigit(input[i])) {
					i++;
				}

				if (input[i] === "." && isDigit(input[i + 1])) {
					i++;

					while (i < input.length && isDigit(input[i])) {
						i++;
					}
				}

				if (isIdentifierStart(input[i])) {
					while (i < input.length && isIdentifierPart(input[i])) {
						i++;
					}

					pushResult = pushToken(tokens, {
						type: "IDENT",
						start: start,
						value: input.slice(start, i)
					});
					if (Result.isFail(pushResult)) {
						return pushResult;
					}
					continue;
				}

				pushResult = pushToken(
					tokens,
					createNumberToken(input.slice(start, i), start)
				);
				if (Result.isFail(pushResult)) {
					return pushResult;
				}

				continue;
			}

			if (isIdentifierStart(char)) {
				const start = i;

				while (i < input.length && isIdentifierPart(input[i])) {
					i++;
				}

				const word = input.slice(start, i);

				if (word === "true" || word === "false") {
					pushResult = pushToken(tokens, {
						type: "BOOLEAN",
						start: start,
						value: word === "true"
					});
					if (Result.isFail(pushResult)) {
						return pushResult;
					}
				} else if (word === "in") {
					pushResult = pushToken(tokens, createToken("IN", start));
					if (Result.isFail(pushResult)) {
						return pushResult;
					}
				} else {
					pushResult = pushToken(tokens, createToken("IDENT", start, word));
					if (Result.isFail(pushResult)) {
						return pushResult;
					}
				}

				continue;
			}

			return Result.fail(
				createSyntaxErrorMessage(input, i, "Unexpected character: " + char)
			);
		}

		return Result.ok(tokens);
	}

	function createParser(tokens, input) {
		return {
			tokens: tokens,
			input: input,
			error: null,

			fail: function (message, token) {
				const target = typeof token === "undefined" ? null : token;
				const index = target ? target.start : this.input.length;

				if (!this.error) {
					this.error = createSyntaxErrorMessage(this.input, index, message);
				}

				return null;
			}
		};
	}

	function parseExpression(parser) {
		const tokens = parser.tokens;
		const output = [];
		const operators = [];
		const contexts = [createExpressionContext("root")];
		let expectOperand = true;
		let expectListOperand = false;
		let token;
		let operatorInfo;
		let fieldResult;
		let listResult;
		let i = 0;

		while (i < tokens.length) {
			token = tokens[i];

			if (token.type === "COMMA") {
				if (expectOperand) {
					return parser.fail("Unexpected token: COMMA", token);
				}

				collapseOperatorsToMarker(parser, operators, output);
				if (parser.error) {
					return null;
				}

				if (
					!operators.length ||
					operators[operators.length - 1].kind !== "call"
				) {
					return parser.fail("Unexpected token: COMMA", token);
				}

				if (
					!finalizeCallArgument(
						parser,
						operators[operators.length - 1],
						output,
						token
					)
				) {
					return null;
				}
				currentExpressionContext(contexts).comparisonUsed = false;
				expectOperand = true;
				expectListOperand = false;
				i++;
				continue;
			}

			if (token.type === "RPAREN") {
				if (expectOperand && !isZeroArgumentCallClose(operators, output)) {
					return parser.fail("Unexpected token: RPAREN", token);
				}

				collapseOperatorsToMarker(parser, operators, output);
				if (parser.error) {
					return null;
				}

				if (!operators.length) {
					return parser.fail("Unexpected token: RPAREN", token);
				}

				if (
					!closeMarker(
						parser,
						operators.pop(),
						contexts,
						output,
						expectOperand,
						token
					)
				) {
					return null;
				}
				expectOperand = false;
				expectListOperand = false;
				i++;
				continue;
			}

			if (expectOperand) {
				if (expectListOperand) {
					listResult = readListNode(parser, i);
					if (!listResult) {
						return null;
					}
					output.push(listResult.node);
					i = listResult.nextIndex;
					expectOperand = false;
					expectListOperand = false;
					continue;
				}

				if (token.type === "NOT") {
					operators.push(
						createOperatorEntry("not", token.start, 4, "right", 1)
					);
					i++;
					continue;
				}

				if (token.type === "LPAREN") {
					operators.push(createGroupMarker(token.start, output.length));
					if (!pushContext(parser, contexts, "group", token)) {
						return null;
					}
					i++;
					continue;
				}

				if (isLiteralTokenType(token.type)) {
					output.push(tokenToLiteralNode(token));
					i++;
					expectOperand = false;
					continue;
				}

				if (token.type === "IDENT") {
					if (isFieldType(token.value)) {
						fieldResult = readFieldNode(parser, i);
						if (!fieldResult) {
							return null;
						}
						output.push(fieldResult.node);
						i = fieldResult.nextIndex;
						expectOperand = false;
						continue;
					}

					if (tokens[i + 1] && tokens[i + 1].type === "LPAREN") {
						operators.push(
							createCallMarker(token.value, token.start, output.length)
						);
						if (!pushContext(parser, contexts, "call", token)) {
							return null;
						}
						i += 2;
						continue;
					}

					return parser.fail(
						"Unexpected identifier: " +
							token.value +
							". Bare identifiers are not valid expressions; use quotes for a string literal.",
						token
					);
				}

				return parser.fail("Unexpected token: " + token.type, token);
			}

			operatorInfo = getBinaryOperatorInfo(token);

			if (!operatorInfo) {
				return parser.fail("Unexpected token: " + token.type, token);
			}

			if (
				operatorInfo.category === "comparison" &&
				currentExpressionContext(contexts).comparisonUsed
			) {
				return parser.fail("Chained comparisons are not supported", token);
			}

			collapseOperatorsForOperator(
				parser,
				operators,
				output,
				operatorInfo.precedence,
				operatorInfo.associativity
			);
			if (parser.error) {
				return null;
			}
			operators.push(
				createOperatorEntry(
					operatorInfo.nodeType,
					token.start,
					operatorInfo.precedence,
					operatorInfo.associativity,
					2
				)
			);

			if (operatorInfo.category === "comparison") {
				currentExpressionContext(contexts).comparisonUsed = true;
			} else {
				currentExpressionContext(contexts).comparisonUsed = false;
			}

			expectOperand = true;
			expectListOperand = token.type === "IN";
			i++;
		}

		if (expectOperand) {
			return parser.fail("Unexpected end of input");
		}

		while (operators.length) {
			if (operators[operators.length - 1].kind !== "operator") {
				return parser.fail("Unexpected end of input");
			}

			applyTopOperator(parser, operators, output);
			if (parser.error) {
				return null;
			}
		}

		if (output.length !== 1) {
			return parser.fail("Invalid expression");
		}

		return output[0];
	}

	function createExpressionContext(kind) {
		return {
			kind: kind,
			comparisonUsed: false
		};
	}

	function currentExpressionContext(contexts) {
		return contexts[contexts.length - 1];
	}

	function createOperatorEntry(
		nodeType,
		start,
		precedence,
		associativity,
		arity
	) {
		return {
			kind: "operator",
			nodeType: nodeType,
			start: start,
			precedence: precedence,
			associativity: associativity,
			arity: arity
		};
	}

	function createGroupMarker(start, valueBase) {
		return {
			kind: "group",
			start: start,
			valueBase: valueBase
		};
	}

	function createCallMarker(name, start, valueBase) {
		return {
			kind: "call",
			name: name,
			start: start,
			valueBase: valueBase,
			args: []
		};
	}

	function tokenToLiteralNode(token) {
		return {
			type: getLiteralNodeType(token.type),
			value: token.value
		};
	}

	function readFieldNode(parser, index) {
		const tokens = parser.tokens;
		const typeToken = tokens[index];
		const firstParen = tokens[index + 1];
		const sourceToken = tokens[index + 2];
		const secondParen = tokens[index + 3];
		const nameToken = tokens[index + 4];
		const thirdParen = tokens[index + 5];
		const fourthParen = tokens[index + 6];
		let fieldName;

		if (!isFieldType(typeToken.value)) {
			return parser.fail("Unknown field type: " + typeToken.value, typeToken);
		}

		if (!firstParen || firstParen.type !== "LPAREN") {
			return parser.fail(
				"Expected LPAREN but got " + (firstParen ? firstParen.type : "EOF"),
				firstParen || typeToken
			);
		}

		if (!sourceToken || sourceToken.type !== "IDENT") {
			return parser.fail(
				"Expected IDENT but got " + (sourceToken ? sourceToken.type : "EOF"),
				sourceToken || firstParen
			);
		}

		if (!isFieldSource(sourceToken.value)) {
			return parser.fail(
				"Unknown field source: " + sourceToken.value,
				sourceToken
			);
		}

		if (!secondParen || secondParen.type !== "LPAREN") {
			return parser.fail(
				"Expected LPAREN but got " + (secondParen ? secondParen.type : "EOF"),
				secondParen || sourceToken
			);
		}

		if (!nameToken) {
			return parser.fail("Expected field name but got EOF", null);
		}

		if (nameToken.type === "IDENT") {
			fieldName = nameToken.value;
		} else if (nameToken.type === "NUMBER") {
			fieldName = nameToken.raw;
		} else {
			return parser.fail(
				"Expected field name but got " + nameToken.type,
				nameToken
			);
		}

		if (!thirdParen || thirdParen.type !== "RPAREN") {
			return parser.fail(
				"Expected RPAREN but got " + (thirdParen ? thirdParen.type : "EOF"),
				thirdParen || nameToken
			);
		}

		if (!fourthParen || fourthParen.type !== "RPAREN") {
			return parser.fail(
				"Expected RPAREN but got " + (fourthParen ? fourthParen.type : "EOF"),
				fourthParen || thirdParen
			);
		}

		return {
			node: {
				type: "field",
				valueType: typeToken.value,
				source: sourceToken.value,
				name: fieldName
			},
			nextIndex: index + 7
		};
	}

	function readListNode(parser, index) {
		const tokens = parser.tokens;
		const items = [];
		let token = tokens[index];
		let expectValue = true;

		if (!token || token.type !== "LPAREN") {
			return parser.fail("Expected '(' after in", token || null);
		}

		index++;

		while (index < tokens.length) {
			token = tokens[index];

			if (expectValue) {
				if (!token) {
					return parser.fail("Unexpected end inside list");
				}

				if (!isLiteralTokenType(token.type)) {
					return parser.fail("Invalid list item: " + token.type, token);
				}

				items.push(token.value);
				if (items.length > MAX_LIST_ITEMS) {
					return parser.fail(
						"List exceeds maximum size of " + MAX_LIST_ITEMS + " items",
						token
					);
				}
				index++;
				expectValue = false;
				continue;
			}

			if (token.type === "COMMA") {
				index++;
				expectValue = true;
				continue;
			}

			if (token.type === "RPAREN") {
				return {
					node: {
						type: "list",
						items: items
					},
					nextIndex: index + 1
				};
			}

			return parser.fail(
				"Expected COMMA or RPAREN but got " + token.type,
				token
			);
		}

		return parser.fail("Unexpected end inside list");
	}

	function getBinaryOperatorInfo(token) {
		switch (token.type) {
			case "OR":
				return {
					nodeType: "or",
					precedence: 1,
					associativity: "left",
					category: "logical"
				};

			case "AND":
				return {
					nodeType: "and",
					precedence: 2,
					associativity: "left",
					category: "logical"
				};

			case "EQ":
				return {
					nodeType: "eq",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "NEQ":
				return {
					nodeType: "neq",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "GT":
				return {
					nodeType: "gt",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "GTE":
				return {
					nodeType: "gte",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "LT":
				return {
					nodeType: "lt",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "LTE":
				return {
					nodeType: "lte",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			case "IN":
				return {
					nodeType: "in",
					precedence: 3,
					associativity: "left",
					category: "comparison"
				};

			default:
				return null;
		}
	}

	function collapseOperatorsForOperator(
		parser,
		operators,
		output,
		precedence,
		associativity
	) {
		while (
			!parser.error &&
			operators.length &&
			operators[operators.length - 1].kind === "operator" &&
			(operators[operators.length - 1].precedence > precedence ||
				(operators[operators.length - 1].precedence === precedence &&
					associativity === "left"))
		) {
			applyTopOperator(parser, operators, output);
		}
	}

	function collapseOperatorsToMarker(parser, operators, output) {
		while (
			!parser.error &&
			operators.length &&
			operators[operators.length - 1].kind === "operator"
		) {
			applyTopOperator(parser, operators, output);
		}
	}

	function applyTopOperator(parser, operators, output) {
		const operator = operators.pop();
		let right;
		let left;

		if (operator.arity === 1) {
			if (!output.length) {
				return parser.fail("Invalid expression", {
					start: operator.start
				});
			}

			output.push({
				type: operator.nodeType,
				value: output.pop()
			});
			return true;
		}

		if (output.length < 2) {
			return parser.fail("Invalid expression", {
				start: operator.start
			});
		}

		right = output.pop();
		left = output.pop();

		output.push({
			type: operator.nodeType,
			left: left,
			right: right
		});

		return true;
	}

	function finalizeCallArgument(parser, marker, output, token) {
		if (output.length <= marker.valueBase) {
			return parser.fail("Unexpected token: COMMA", token || marker);
		}

		marker.args.push(output.pop());
		if (marker.args.length > MAX_CALL_ARGUMENTS) {
			return parser.fail(
				"Function call exceeds maximum of " + MAX_CALL_ARGUMENTS + " arguments",
				token || marker
			);
		}

		return true;
	}

	function isZeroArgumentCallClose(operators, output) {
		const marker = operators[operators.length - 1];

		return (
			marker &&
			marker.kind === "call" &&
			output.length === marker.valueBase &&
			marker.args.length === 0
		);
	}

	function closeMarker(parser, marker, contexts, output, expectOperand, token) {
		if (marker.kind === "group") {
			contexts.pop();

			if (output.length <= marker.valueBase) {
				return parser.fail("Unexpected token: RPAREN", token);
			}

			return true;
		}

		contexts.pop();

		if (
			!expectOperand &&
			!finalizeCallArgument(parser, marker, output, token)
		) {
			return null;
		}

		output.push({
			type: "call",
			name: marker.name,
			args: marker.args
		});

		return true;
	}

	function isFieldType(name) {
		return FIELD_TYPES[name] === true;
	}

	function isFieldSource(name) {
		return FIELD_SOURCES[name] === true;
	}

	function isLiteralTokenType(type) {
		return type === "BOOLEAN" || type === "STRING" || type === "NUMBER";
	}

	function getLiteralNodeType(tokenType) {
		if (tokenType === "BOOLEAN") {
			return "boolean";
		}

		if (tokenType === "STRING") {
			return "string";
		}

		return "number";
	}

	function evaluate(node, context) {
		const frames = [];
		const values = [];
		let frame;
		let nodeType;
		let getter;
		let getterResult;
		let sourceObject;
		let result;
		let value;
		let leftValue;
		let rightValue;
		let itemIndex;
		let functionName;
		let args;
		let format;
		let date;
		let shiftedDate;
		let formattedValue;
		let tokenIndex;
		let formatToken;
		let supportedTokens;
		let i;

		if (!node) {
			return Result.fail("Cannot evaluate empty node");
		}

		frames.push({
			node: node,
			stage: 0
		});

		while (frames.length) {
			frame = frames[frames.length - 1];
			nodeType = frame.node.type;

			if (
				nodeType === "boolean" ||
				nodeType === "number" ||
				nodeType === "string"
			) {
				values.push(frame.node.value);
				frames.pop();
				continue;
			}

			if (nodeType === "field") {
				value = null;

				if (frame.node.source === "local") {
					if (context && typeof context.getField === "function") {
						result = context.getField(frame.node.source, frame.node.name);
						if (!(Result.isOk(result) || Result.isFail(result))) {
							return Result.fail(
								"context.getField must return a Result for " +
									frame.node.source +
									"." +
									frame.node.name
							);
						}
						if (Result.isFail(result)) {
							return result;
						}
						value = result.value;
					} else {
						getter = context && context.getLocalField;
						if (typeof getter === "function") {
							getterResult = getter.call(context, frame.node.name);
							if (!(Result.isOk(getterResult) || Result.isFail(getterResult))) {
								return Result.fail(
									"context.getLocalField must return a Result for " +
										frame.node.source +
										"." +
										frame.node.name
								);
							}
							if (Result.isFail(getterResult)) {
								return getterResult;
							}
							value = getterResult.value;
						} else {
							sourceObject = context && context.local;
							if (!sourceObject) {
								return Result.fail(
									"Missing context source: " + frame.node.source
								);
							}

							if (!hasField(frame.node.source, sourceObject, frame.node.name)) {
								return Result.fail(
									"Field not found: " +
										frame.node.source +
										"." +
										frame.node.name
								);
							}

							value = sourceObject[frame.node.name];
						}
					}
				} else if (frame.node.source === "srp") {
					if (context && typeof context.getField === "function") {
						result = context.getField(frame.node.source, frame.node.name);
						if (!(Result.isOk(result) || Result.isFail(result))) {
							return Result.fail(
								"context.getField must return a Result for " +
									frame.node.source +
									"." +
									frame.node.name
							);
						}
						if (Result.isFail(result)) {
							return result;
						}
						value = result.value;
					} else {
						getter = context && context.getSrpField;

						if (typeof getter === "function") {
							getterResult = getter.call(context, frame.node.name);
							if (!(Result.isOk(getterResult) || Result.isFail(getterResult))) {
								return Result.fail(
									"context.getSrpField must return a Result for " +
										frame.node.source +
										"." +
										frame.node.name
								);
							}
							if (Result.isFail(getterResult)) {
								return getterResult;
							}
							value = getterResult.value;
						} else {
							sourceObject = context && context.srp;

							if (!sourceObject) {
								return Result.fail(
									"Missing context source: " + frame.node.source
								);
							}

							if (!hasField(frame.node.source, sourceObject, frame.node.name)) {
								return Result.fail(
									"Field not found: " +
										frame.node.source +
										"." +
										frame.node.name
								);
							}

							value = sourceObject[frame.node.name];
						}
					}
				} else {
					return Result.fail("Unknown field source: " + frame.node.source);
				}

				if (frame.node.valueType === "bool" && value == null) {
					value = false;
				}

				if (frame.node.valueType === "bool") {
					if (typeof value !== "boolean") {
						return Result.fail(
							"Expected boolean for field: " + frame.node.name
						);
					}
				} else if (frame.node.valueType === "num") {
					if (typeof value !== "number") {
						return Result.fail("Expected number for field: " + frame.node.name);
					}
				} else if (frame.node.valueType === "str") {
					if (typeof value !== "string") {
						return Result.fail("Expected string for field: " + frame.node.name);
					}
				} else {
					return Result.fail(
						"Unknown field valueType: " + frame.node.valueType
					);
				}

				values.push(value);
				frames.pop();
				continue;
			}

			if (nodeType === "list") {
				values.push(frame.node.items);
				frames.pop();
				continue;
			}

			if (nodeType === "not") {
				if (frame.stage === 0) {
					frame.stage = 1;
					frames.push({
						node: frame.node.value,
						stage: 0
					});
					continue;
				}

				value = values.pop();

				if (typeof value !== "boolean") {
					return Result.fail("Operand of NOT must be boolean");
				}

				values.push(!value);
				frames.pop();
				continue;
			}

			if (
				nodeType === "eq" ||
				nodeType === "neq" ||
				nodeType === "gt" ||
				nodeType === "gte" ||
				nodeType === "lt" ||
				nodeType === "lte"
			) {
				if (frame.stage === 0) {
					frame.stage = 1;
					frames.push({
						node: frame.node.left,
						stage: 0
					});
					continue;
				}

				if (frame.stage === 1) {
					frame.leftValue = values.pop();
					frame.stage = 2;
					frames.push({
						node: frame.node.right,
						stage: 0
					});
					continue;
				}

				rightValue = values.pop();
				leftValue = frame.leftValue;

				if (nodeType === "eq") {
					values.push(leftValue === rightValue);
					frames.pop();
					continue;
				}

				if (nodeType === "neq") {
					values.push(leftValue !== rightValue);
					frames.pop();
					continue;
				}

				if (typeof leftValue !== "number") {
					if (nodeType === "gt") {
						return Result.fail("Left side of > must be a number");
					}
					if (nodeType === "gte") {
						return Result.fail("Left side of >= must be a number");
					}
					if (nodeType === "lt") {
						return Result.fail("Left side of < must be a number");
					}
					return Result.fail("Left side of <= must be a number");
				}

				if (typeof rightValue !== "number") {
					if (nodeType === "gt") {
						return Result.fail("Right side of > must be a number");
					}
					if (nodeType === "gte") {
						return Result.fail("Right side of >= must be a number");
					}
					if (nodeType === "lt") {
						return Result.fail("Right side of < must be a number");
					}
					return Result.fail("Right side of <= must be a number");
				}

				if (nodeType === "gt") {
					values.push(leftValue > rightValue);
				} else if (nodeType === "gte") {
					values.push(leftValue >= rightValue);
				} else if (nodeType === "lt") {
					values.push(leftValue < rightValue);
				} else {
					values.push(leftValue <= rightValue);
				}

				frames.pop();
				continue;
			}

			if (nodeType === "in") {
				if (frame.stage === 0) {
					frame.stage = 1;
					frames.push({
						node: frame.node.left,
						stage: 0
					});
					continue;
				}

				leftValue = values.pop();
				value = false;

				for (
					itemIndex = 0;
					itemIndex < frame.node.right.items.length;
					itemIndex++
				) {
					if (leftValue === frame.node.right.items[itemIndex]) {
						value = true;
						break;
					}
				}

				values.push(value);
				frames.pop();
				continue;
			}

			if (nodeType === "and") {
				if (frame.stage === 0) {
					frame.stage = 1;
					frames.push({
						node: frame.node.left,
						stage: 0
					});
					continue;
				}

				if (frame.stage === 1) {
					frame.leftValue = values.pop();

					if (typeof frame.leftValue !== "boolean") {
						return Result.fail("Left side of AND must be boolean");
					}

					if (!frame.leftValue) {
						values.push(false);
						frames.pop();
						continue;
					}

					frame.stage = 2;
					frames.push({
						node: frame.node.right,
						stage: 0
					});
					continue;
				}

				value = values.pop();

				if (typeof value !== "boolean") {
					return Result.fail("Right side of AND must be boolean");
				}

				values.push(value);
				frames.pop();
				continue;
			}

			if (nodeType === "or") {
				if (frame.stage === 0) {
					frame.stage = 1;
					frames.push({
						node: frame.node.left,
						stage: 0
					});
					continue;
				}

				if (frame.stage === 1) {
					frame.leftValue = values.pop();

					if (typeof frame.leftValue !== "boolean") {
						return Result.fail("Left side of OR must be boolean");
					}

					if (frame.leftValue) {
						values.push(true);
						frames.pop();
						continue;
					}

					frame.stage = 2;
					frames.push({
						node: frame.node.right,
						stage: 0
					});
					continue;
				}

				value = values.pop();

				if (typeof value !== "boolean") {
					return Result.fail("Right side of OR must be boolean");
				}

				values.push(value);
				frames.pop();
				continue;
			}

			if (nodeType === "call") {
				if (frame.node.name === "If") {
					if (frame.stage === 0) {
						if (frame.node.args.length !== 3) {
							return Result.fail("If requires exactly 3 arguments");
						}

						frame.stage = 1;
						frames.push({
							node: frame.node.args[0],
							stage: 0
						});
						continue;
					}

					if (frame.stage === 1) {
						value = values.pop();

						if (typeof value !== "boolean") {
							return Result.fail("If condition must be boolean");
						}

						frame.stage = 2;
						frames.push({
							node: value ? frame.node.args[1] : frame.node.args[2],
							stage: 0
						});
						continue;
					}

					frames.pop();
					continue;
				}

				if (frame.stage === 0) {
					frame.args = [];
					frame.argIndex = 0;

					if (frame.node.args.length) {
						frame.stage = 1;
						frames.push({
							node: frame.node.args[0],
							stage: 0
						});
						continue;
					}
				} else {
					frame.args.push(values.pop());
					frame.argIndex++;

					if (frame.argIndex < frame.node.args.length) {
						frames.push({
							node: frame.node.args[frame.argIndex],
							stage: 0
						});
						continue;
					}
				}

				functionName = frame.node.name;
				args = frame.args;

				if (functionName === "TrySrpBool") {
					if (args.length !== 2) {
						return Result.fail("TrySrpBool requires exactly 2 arguments");
					}

					if (typeof args[0] !== "string") {
						return Result.fail(
							"TrySrpBool field name argument must be a string"
						);
					}

					if (typeof args[1] !== "boolean") {
						return Result.fail("TrySrpBool fallback argument must be boolean");
					}

					value = args[1];

					if (context && typeof context.getField === "function") {
						result = context.getField("srp", args[0]);
						if (!(Result.isOk(result) || Result.isFail(result))) {
							return Result.fail(
								"context.getField must return a Result for srp." + args[0]
							);
						}
						if (Result.isOk(result)) {
							value = result.value;
						}
					} else if (context && typeof context.getSrpField === "function") {
						result = context.getSrpField(args[0]);
						if (!(Result.isOk(result) || Result.isFail(result))) {
							return Result.fail(
								"context.getSrpField must return a Result for srp." + args[0]
							);
						}
						if (Result.isOk(result)) {
							value = result.value;
						}
					} else if (
						context &&
						context.srp &&
						hasField("srp", context.srp, args[0])
					) {
						value = context.srp[args[0]];
					}

					if (typeof value === "boolean") {
						values.push(value);
						frames.pop();
						continue;
					}

					if (value === "true") {
						values.push(true);
						frames.pop();
						continue;
					}

					if (value === "false") {
						values.push(false);
						frames.pop();
						continue;
					}

					values.push(args[1]);
					frames.pop();
					continue;
				}

				if (functionName === "ToBool") {
					if (args.length !== 1) {
						return Result.fail("ToBool requires exactly 1 argument");
					}

					if (typeof args[0] === "boolean") {
						values.push(args[0]);
						frames.pop();
						continue;
					}

					if (typeof args[0] !== "string") {
						return Result.fail("ToBool argument must be a string or boolean");
					}

					if (args[0] === "true") {
						values.push(true);
						frames.pop();
						continue;
					}

					if (args[0] === "false") {
						values.push(false);
						frames.pop();
						continue;
					}

					return Result.fail("ToBool argument must be 'true' or 'false'");
				}

				if (functionName === "ToNum") {
					if (args.length !== 1) {
						return Result.fail("ToNum requires exactly 1 argument");
					}

					if (typeof args[0] === "number") {
						values.push(args[0]);
						frames.pop();
						continue;
					}

					if (typeof args[0] !== "string") {
						return Result.fail("ToNum argument must be a string or number");
					}

					if (!/^-?\d+(\.\d+)?$/.test(args[0])) {
						return Result.fail("ToNum argument must be a numeric string");
					}

					values.push(Number(args[0]));
					frames.pop();
					continue;
				}

				if (functionName === "Concat") {
					formattedValue = "";

					for (i = 0; i < args.length; i++) {
						if (typeof args[i] !== "string") {
							return Result.fail("Concat arguments must all be strings");
						}

						formattedValue += args[i];
					}

					values.push(formattedValue);
					frames.pop();
					continue;
				}

				if (functionName === "FormatDate") {
					if (args.length !== 1 && args.length !== 2) {
						return Result.fail("FormatDate requires 1 or 2 arguments");
					}

					if (typeof args[0] !== "string") {
						return Result.fail("FormatDate first argument must be a string");
					}

					if (args.length === 2 && typeof args[1] !== "string") {
						return Result.fail("FormatDate second argument must be a string");
					}

					date = new Date(args[0]);
					if (isNaN(date.getTime())) {
						return Result.fail(
							"FormatDate first argument must be a valid date string"
						);
					}

					format = args.length === 2 ? args[1] : "dd/MM/yyyy";
					shiftedDate = new Date(date.getTime() + 10 * 60 * 60 * 1000);
					formattedValue = "";
					supportedTokens = ["yyyy", "MM", "dd", "HH", "hh", "mm", "tt"];
					tokenIndex = 0;

					while (tokenIndex < format.length) {
						if (isIdentifierStart(format[tokenIndex])) {
							formatToken = null;

							for (i = 0; i < supportedTokens.length; i++) {
								if (
									format.substr(tokenIndex, supportedTokens[i].length) ===
									supportedTokens[i]
								) {
									formatToken = supportedTokens[i];
									break;
								}
							}

							if (!formatToken) {
								return Result.fail(
									"FormatDate format contains unsupported token at index " +
										tokenIndex
								);
							}

							if (formatToken === "yyyy") {
								formattedValue += String(shiftedDate.getUTCFullYear());
							} else if (formatToken === "MM") {
								value = String(shiftedDate.getUTCMonth() + 1);
								if (value.length < 2) {
									value = "0" + value;
								}
								formattedValue += value;
							} else if (formatToken === "dd") {
								value = String(shiftedDate.getUTCDate());
								if (value.length < 2) {
									value = "0" + value;
								}
								formattedValue += value;
							} else if (formatToken === "HH") {
								value = String(shiftedDate.getUTCHours());
								if (value.length < 2) {
									value = "0" + value;
								}
								formattedValue += value;
							} else if (formatToken === "hh") {
								value = shiftedDate.getUTCHours();
								if (value === 0) {
									value = 12;
								} else if (value > 12) {
									value = value - 12;
								}
								value = String(value);
								if (value.length < 2) {
									value = "0" + value;
								}
								formattedValue += value;
							} else if (formatToken === "mm") {
								value = String(shiftedDate.getUTCMinutes());
								if (value.length < 2) {
									value = "0" + value;
								}
								formattedValue += value;
							} else {
								formattedValue += shiftedDate.getUTCHours() < 12 ? "AM" : "PM";
							}

							tokenIndex += formatToken.length;
							continue;
						}

						formattedValue += format[tokenIndex];
						tokenIndex++;
					}

					values.push(formattedValue);
					frames.pop();
					continue;
				}

				return Result.fail("Unknown function: " + functionName);
			}

			return Result.fail("Unsupported node type: " + nodeType);
		}

		if (values.length !== 1) {
			return Result.fail("Invalid evaluation state");
		}

		return Result.ok(values[0]);
	}

	return {
		evaluateExpression: evaluateExpression,
		tryEvaluate: tryEvaluate,
		tryEvaluateExpression: tryEvaluateExpression
	};
})();

if (typeof module !== "undefined" && module.exports) {
	module.exports = ExpressionEngine;
}
