const ExpressionEngine = require("./expressionEngine");

const TEST_MAX_EXPRESSION_LENGTH = 2000;
const TEST_MAX_TOKEN_COUNT = 512;
const TEST_MAX_NESTING_DEPTH = 64;
const TEST_MAX_CALL_ARGUMENTS = 8;
const TEST_MAX_LIST_ITEMS = 16;

function assertEqual(actual, expected, description) {
	if (actual !== expected) {
		throw new Error(
			description +
				" failed. Expected " +
				JSON.stringify(expected) +
				" but got " +
				JSON.stringify(actual)
		);
	}
}

function assertThrows(fn, expectedMessage, description) {
	let error = null;

	try {
		fn();
	} catch (caught) {
		error = caught;
	}

	if (!error) {
		throw new Error(description + " failed. Expected an error.");
	}

	if (expectedMessage && error.message.indexOf(expectedMessage) === -1) {
		throw new Error(
			description +
				" failed. Expected error containing " +
				JSON.stringify(expectedMessage) +
				" but got " +
				JSON.stringify(error.message)
		);
	}
}

function assertThrowsAll(fn, expectedMessages, description) {
	let error = null;
	let i;

	try {
		fn();
	} catch (caught) {
		error = caught;
	}

	if (!error) {
		throw new Error(description + " failed. Expected an error.");
	}

	for (i = 0; i < expectedMessages.length; i++) {
		if (error.message.indexOf(expectedMessages[i]) === -1) {
			throw new Error(
				description +
					" failed. Expected error containing " +
					JSON.stringify(expectedMessages[i]) +
					" but got " +
					JSON.stringify(error.message)
			);
		}
	}
}

function assertOkResult(result, expectedValue, description) {
	if (!result || result.ok !== true) {
		throw new Error(description + " failed. Expected an ok result.");
	}

	if (result.value !== expectedValue) {
		throw new Error(
			description +
				" failed. Expected value " +
				JSON.stringify(expectedValue) +
				" but got " +
				JSON.stringify(result.value)
		);
	}
}

function assertFailResult(result, expectedMessages, description) {
	let i;

	if (!result || result.ok !== false) {
		throw new Error(description + " failed. Expected a failed result.");
	}

	for (i = 0; i < expectedMessages.length; i++) {
		if (result.error.indexOf(expectedMessages[i]) === -1) {
			throw new Error(
				description +
					" failed. Expected error containing " +
					JSON.stringify(expectedMessages[i]) +
					" but got " +
					JSON.stringify(result.error)
			);
		}
	}
}

function runTest(description, fn) {
	fn();
	console.log("PASS " + description);
}

function repeatString(value, count) {
	let result = "";
	let i;

	for (i = 0; i < count; i++) {
		result += value;
	}

	return result;
}

const baseContext = {
	srp: {
		A: true,
		B: false,
		Status: "Open",
		Count: 2,
		Amount: 2.5,
		NegativeAmount: -2.5,
		"1_Field_Name": true,
		"1ABC_2": false,
		123: true
	},
	local: {
		Flag: true
	}
};

runTest("unwraps expression containers", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{If(bool(srp(A)), 'Yes', 'No')}}",
		baseContext
	);

	assertEqual(result, "Yes", "wrapped expression");
});

runTest("gives AND higher precedence than OR", function () {
	const result = ExpressionEngine.evaluateExpression(
		"true || false && false",
		baseContext
	);

	assertEqual(result, true, "operator precedence");
});

runTest("respects grouped precedence", function () {
	const result = ExpressionEngine.evaluateExpression(
		"(true || false) && false",
		baseContext
	);

	assertEqual(result, false, "grouped precedence");
});

runTest("supports wrapped boolean literals", function () {
	const result = ExpressionEngine.evaluateExpression("{{(true)}}", baseContext);

	assertEqual(result, true, "wrapped grouped true");
});

runTest("supports wrapped false literals", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{(false)}}",
		baseContext
	);

	assertEqual(result, false, "wrapped grouped false");
});

runTest("supports unary NOT on grouped expressions", function () {
	const result = ExpressionEngine.evaluateExpression("!(true)", baseContext);

	assertEqual(result, false, "grouped not");
});

runTest("supports wrapped unary NOT on grouped true", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{!(true)}}",
		baseContext
	);

	assertEqual(result, false, "wrapped grouped not true");
});

runTest("supports wrapped unary NOT on grouped false", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{!(false)}}",
		baseContext
	);

	assertEqual(result, true, "wrapped grouped not false");
});

runTest("supports repeated unary NOT", function () {
	const result = ExpressionEngine.evaluateExpression(
		"!!bool(srp(A))",
		baseContext
	);

	assertEqual(result, true, "repeated not");
});

runTest("supports unary NOT on function calls", function () {
	const result = ExpressionEngine.evaluateExpression(
		"!If(true, false, true)",
		baseContext
	);

	assertEqual(result, true, "function call not");
});

runTest("requires unary NOT operands to be boolean", function () {
	assertThrows(
		function () {
			ExpressionEngine.evaluateExpression("!'text'", baseContext);
		},
		"Operand of NOT must be boolean",
		"strict boolean not"
	);
});

runTest("allows grouped expressions on the right side of ==", function () {
	const result = ExpressionEngine.evaluateExpression(
		"true == (true)",
		baseContext
	);

	assertEqual(result, true, "grouped equality");
});

runTest("supports not equal comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"str(srp(Status)) != 'Closed'",
		baseContext
	);

	assertEqual(result, true, "not equal comparison");
});

runTest("supports false not equal comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"str(srp(Status)) != 'Open'",
		baseContext
	);

	assertEqual(result, false, "false not equal comparison");
});

runTest("supports wrapped not equal expressions", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{str(srp(Status)) != 'Closed'}}",
		baseContext
	);

	assertEqual(result, true, "wrapped not equal comparison");
});

runTest("gives equality operators higher precedence than AND", function () {
	const result = ExpressionEngine.evaluateExpression(
		"true && str(srp(Status)) != 'Closed'",
		baseContext
	);

	assertEqual(result, true, "not equal precedence");
});

runTest("evaluates literal IN lists without extra AST nodes", function () {
	const result = ExpressionEngine.evaluateExpression(
		"str(srp(Status)) in ('Open', 'Closed')",
		baseContext
	);

	assertEqual(result, true, "string in list");
});

runTest("supports escaped quotes in strings", function () {
	const result = ExpressionEngine.evaluateExpression("'Bob\\'s'", baseContext);

	assertEqual(result, "Bob's", "escaped quote");
});

runTest("supports escaped backslashes in strings", function () {
	const result = ExpressionEngine.evaluateExpression(
		"'C:\\\\Temp'",
		baseContext
	);

	assertEqual(result, "C:\\Temp", "escaped backslash");
});

runTest("supports decimal literals", function () {
	const result = ExpressionEngine.evaluateExpression("2.5 == 2.5", baseContext);

	assertEqual(result, true, "decimal literal");
});

runTest("supports negative decimal literals", function () {
	const result = ExpressionEngine.evaluateExpression(
		"-2.5 == -2.5",
		baseContext
	);

	assertEqual(result, true, "negative decimal literal");
});

runTest("supports decimal field comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(Amount)) == 2.5",
		baseContext
	);

	assertEqual(result, true, "decimal field comparison");
});

runTest("supports negative decimal field comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(NegativeAmount)) == -2.5",
		baseContext
	);

	assertEqual(result, true, "negative decimal field comparison");
});

runTest("supports decimal literals in IN lists", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(Amount)) in (1.5, 2.5, 3.5)",
		baseContext
	);

	assertEqual(result, true, "decimal in list");
});

runTest("formats dates with default FormatDate pattern", function () {
	const result = ExpressionEngine.evaluateExpression(
		"FormatDate('2026-04-01T14:00:00.0000000Z')",
		baseContext
	);

	assertEqual(result, "02/04/2026", "FormatDate default pattern");
});

runTest("formats dates with explicit 12 hour FormatDate pattern", function () {
	const result = ExpressionEngine.evaluateExpression(
		"FormatDate('2026-04-01T14:00:00.0000000Z', 'dd/MM/yyyy hh:mm tt')",
		baseContext
	);

	assertEqual(result, "02/04/2026 12:00 AM", "FormatDate 12 hour pattern");
});

runTest("supports greater than comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(Amount)) > 2.0",
		baseContext
	);

	assertEqual(result, true, "greater than");
});

runTest("supports greater than or equal comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(Amount)) >= 2.5",
		baseContext
	);

	assertEqual(result, true, "greater than or equal");
});

runTest("supports less than comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(NegativeAmount)) < 0",
		baseContext
	);

	assertEqual(result, true, "less than");
});

runTest("supports less than or equal comparisons", function () {
	const result = ExpressionEngine.evaluateExpression(
		"num(srp(Amount)) <= 2.5",
		baseContext
	);

	assertEqual(result, true, "less than or equal");
});

runTest("supports digit-leading field names", function () {
	const result = ExpressionEngine.evaluateExpression(
		"bool(srp(1ABC_2))",
		baseContext
	);

	assertEqual(result, false, "digit-leading field name");
});

runTest("supports digit-leading underscore field names", function () {
	const result = ExpressionEngine.evaluateExpression(
		"bool(srp(1_Field_Name))",
		baseContext
	);

	assertEqual(result, true, "digit-leading underscore field name");
});

runTest("supports numeric field names", function () {
	const result = ExpressionEngine.evaluateExpression(
		"bool(srp(123))",
		baseContext
	);

	assertEqual(result, true, "numeric field name");
});

runTest("short-circuits If branches", function () {
	const result = ExpressionEngine.evaluateExpression(
		"{{If(bool(srp(A)), 'Yes', bool(srp(MissingField)))}}",
		baseContext
	);

	assertEqual(result, "Yes", "if short circuit");
});

runTest("rejects unknown field sources during parsing", function () {
	assertThrows(
		function () {
			ExpressionEngine.evaluateExpression("bool(remote(Status))", baseContext);
		},
		"Unknown field source: remote",
		"unknown field source"
	);
});

runTest("adds expression context to evaluation errors", function () {
	assertThrowsAll(
		function () {
			ExpressionEngine.evaluateExpression(
				"bool(srp(MissingField))",
				baseContext
			);
		},
		[
			"Field not found: srp.MissingField",
			"Expression: bool(srp(MissingField))"
		],
		"evaluation error context"
	);
});

runTest("adds index context to syntax errors", function () {
	assertThrowsAll(
		function () {
			ExpressionEngine.evaluateExpression(".5 == 0.5", baseContext);
		},
		["Unexpected character: . at index 0", "Expression: .5 == 0.5"],
		"syntax error context"
	);
});

runTest("rejects decimals without a leading digit", function () {
	assertThrows(
		function () {
			ExpressionEngine.evaluateExpression(".5 == 0.5", baseContext);
		},
		"Unexpected character: .",
		"missing leading digit decimal"
	);
});

runTest("rejects decimals without a trailing digit", function () {
	assertThrows(
		function () {
			ExpressionEngine.evaluateExpression("5. == 5", baseContext);
		},
		"Unexpected character: .",
		"missing trailing digit decimal"
	);
});

runTest("rejects non-numeric inequality operands", function () {
	assertThrowsAll(
		function () {
			ExpressionEngine.evaluateExpression(
				"str(srp(Status)) > 'Closed'",
				baseContext
			);
		},
		[
			"Left side of > must be a number",
			"Expression: str(srp(Status)) > 'Closed'"
		],
		"non numeric inequality"
	);
});

runTest("only reads own properties from srp field sources", function () {
	const inheritedContext = {
		srp: Object.create({ InheritedFlag: true }),
		local: {}
	};

	assertThrows(
		function () {
			ExpressionEngine.evaluateExpression(
				"bool(srp(InheritedFlag))",
				inheritedContext
			);
		},
		"Field not found: srp.InheritedFlag",
		"own property field lookup"
	);
});

runTest("reads inherited properties from local field sources", function () {
	const inheritedContext = {
		srp: {},
		local: Object.create({ InheritedFlag: true })
	};

	assertEqual(
		ExpressionEngine.evaluateExpression(
			"bool(local(InheritedFlag))",
			inheritedContext
		),
		true,
		"local inherited field lookup"
	);
});

runTest("returns ok results without throwing", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"{{If(bool(srp(A)), 'Yes', 'No')}}",
		baseContext
	);

	assertOkResult(result, "Yes", "ok result contract");
});

runTest(
	"returns raw values from tryEvaluate when no tag is present",
	function () {
		const result = ExpressionEngine.tryEvaluate(
			"not actually an expression",
			baseContext
		);

		assertOkResult(
			result,
			"not actually an expression",
			"tryEvaluate raw value"
		);
	}
);

runTest(
	"evaluates tagged values from tryEvaluate with surrounding whitespace",
	function () {
		const result = ExpressionEngine.tryEvaluate(
			"  {{If(bool(srp(A)), 'Yes', 'No')}}  ",
			baseContext
		);

		assertOkResult(result, "Yes", "tryEvaluate tagged value");
	}
);

runTest("rejects malformed tags from tryEvaluate", function () {
	const result = ExpressionEngine.tryEvaluate("{{bool(srp(A))", baseContext);

	assertFailResult(
		result,
		["Malformed expression tag"],
		"tryEvaluate malformed tag"
	);
});

runTest("rejects non-whitespace content outside tryEvaluate tags", function () {
	const result = ExpressionEngine.tryEvaluate(
		"prefix {{bool(srp(A))}}",
		baseContext
	);

	assertFailResult(
		result,
		["Malformed expression tag"],
		"tryEvaluate extra outer content"
	);
});

runTest("supports local field getter hooks", function () {
	const result = ExpressionEngine.tryEvaluateExpression("bool(local(Flag))", {
		getLocalField: function (name) {
			if (name === "Flag") {
				return { ok: true, value: true };
			}

			return { ok: false, error: "Field not found: local." + name };
		}
	});

	assertOkResult(result, true, "local field getter hook");
});

runTest("normalizes null local boolean fields to false", function () {
	const result = ExpressionEngine.tryEvaluateExpression("bool(local(Flag))", {
		local: {
			Flag: null
		}
	});

	assertOkResult(result, false, "null local boolean normalization");
});

runTest("supports generic field getter hooks", function () {
	const result = ExpressionEngine.tryEvaluateExpression("num(srp(Amount))", {
		getField: function (source, name) {
			if (source === "srp" && name === "Amount") {
				return { ok: true, value: 2.5 };
			}

			return { ok: false, error: "Field not found: " + source + "." + name };
		}
	});

	assertOkResult(result, 2.5, "generic field getter hook");
});

runTest("converts strict boolean strings with TrySrpBool", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"TrySrpBool('FlagText', false)",
		{
			srp: {
				FlagText: "true"
			}
		}
	);

	assertOkResult(result, true, "TrySrpBool strict true conversion");
});

runTest("returns fallback for missing srp fields with TrySrpBool", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"TrySrpBool('MissingFlag', false)",
		baseContext
	);

	assertOkResult(result, false, "TrySrpBool missing fallback");
});

runTest(
	"returns fallback for non-boolean srp strings with TrySrpBool",
	function () {
		const result = ExpressionEngine.tryEvaluateExpression(
			"TrySrpBool('FlagText', false)",
			{
				srp: {
					FlagText: "TRUE"
				}
			}
		);

		assertOkResult(result, false, "TrySrpBool invalid string fallback");
	}
);

runTest("requires boolean fallback with TrySrpBool", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"TrySrpBool('FlagText', 'false')",
		baseContext
	);

	assertFailResult(
		result,
		[
			"TrySrpBool fallback argument must be boolean",
			"Expression: TrySrpBool('FlagText', 'false')"
		],
		"TrySrpBool fallback type"
	);
});

runTest("converts strict boolean strings with ToBool", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"ToBool(str(srp(FlagText)))",
		{
			srp: {
				FlagText: "true"
			}
		}
	);

	assertOkResult(result, true, "ToBool strict true conversion");
});

runTest("rejects non-boolean strings with ToBool", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"ToBool('TRUE')",
		baseContext
	);

	assertFailResult(
		result,
		["ToBool argument must be 'true' or 'false'", "Expression: ToBool('TRUE')"],
		"ToBool strict rejection"
	);
});

runTest("converts strict numeric strings with ToNum", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"ToNum(str(srp(CountText)))",
		{
			srp: {
				CountText: "1"
			}
		}
	);

	assertOkResult(result, 1, "ToNum strict numeric conversion");
});

runTest("rejects non-numeric strings with ToNum", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"ToNum('1x')",
		baseContext
	);

	assertFailResult(
		result,
		["ToNum argument must be a numeric string", "Expression: ToNum('1x')"],
		"ToNum strict rejection"
	);
});

runTest("rejects invalid date strings with FormatDate", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"FormatDate('not-a-date')",
		baseContext
	);

	assertFailResult(
		result,
		[
			"FormatDate first argument must be a valid date string",
			"Expression: FormatDate('not-a-date')"
		],
		"FormatDate invalid date"
	);
});

runTest("rejects unsupported tokens with FormatDate", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"FormatDate('2026-04-01T14:00:00.0000000Z', 'dd/MMM/yyyy')",
		baseContext
	);

	assertFailResult(
		result,
		[
			"FormatDate format contains unsupported token",
			"Expression: FormatDate('2026-04-01T14:00:00.0000000Z', 'dd/MMM/yyyy')"
		],
		"FormatDate unsupported token"
	);
});

runTest("normalizes null boolean getter results to false", function () {
	const result = ExpressionEngine.tryEvaluateExpression("bool(srp(Flag))", {
		getField: function (source, name) {
			if (source === "srp" && name === "Flag") {
				return { ok: true, value: null };
			}

			return { ok: false, error: "Field not found: " + source + "." + name };
		}
	});

	assertOkResult(result, false, "null boolean getter normalization");
});

runTest("returns failed results without throwing", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		"str(srp(Status)) > 'Closed'",
		baseContext
	);

	assertFailResult(
		result,
		[
			"Left side of > must be a number",
			"Expression: str(srp(Status)) > 'Closed'"
		],
		"fail result contract"
	);
});

runTest("rejects field getters that do not return Result objects", function () {
	const result = ExpressionEngine.tryEvaluateExpression("bool(local(Flag))", {
		getLocalField: function () {
			return true;
		}
	});

	assertFailResult(
		result,
		["context.getLocalField must return a Result for local.Flag"],
		"invalid field getter contract"
	);
});

runTest(
	"supports repeated failed results without using exceptions",
	function () {
		const first = ExpressionEngine.tryEvaluateExpression(
			"!'text'",
			baseContext
		);
		const second = ExpressionEngine.tryEvaluateExpression(
			"str(srp(Status)) > 'Closed'",
			baseContext
		);

		assertFailResult(
			first,
			["Operand of NOT must be boolean", "Expression: !'text'"],
			"first repeated failed result"
		);
		assertFailResult(
			second,
			[
				"Left side of > must be a number",
				"Expression: str(srp(Status)) > 'Closed'"
			],
			"second repeated failed result"
		);
	}
);

runTest("guards maximum expression length", function () {
	const result = ExpressionEngine.tryEvaluateExpression(
		repeatString("a", TEST_MAX_EXPRESSION_LENGTH + 1),
		baseContext
	);

	assertFailResult(
		result,
		[
			"Expression exceeds maximum length of " +
				TEST_MAX_EXPRESSION_LENGTH +
				" characters"
		],
		"maximum expression length"
	);
});

runTest("guards maximum token count", function () {
	const parts = [];
	let i;

	for (i = 0; i < TEST_MAX_TOKEN_COUNT / 2 + 50; i++) {
		parts.push("true");
	}

	assertFailResult(
		ExpressionEngine.tryEvaluateExpression(parts.join("||"), baseContext),
		["Expression exceeds maximum token count of " + TEST_MAX_TOKEN_COUNT],
		"maximum token count"
	);
});

runTest("guards maximum nesting depth", function () {
	const expr =
		repeatString("(", TEST_MAX_NESTING_DEPTH + 6) +
		"true" +
		repeatString(")", TEST_MAX_NESTING_DEPTH + 6);

	assertFailResult(
		ExpressionEngine.tryEvaluateExpression(expr, baseContext),
		["Expression nesting exceeds maximum depth of " + TEST_MAX_NESTING_DEPTH],
		"maximum nesting depth"
	);
});

runTest("guards maximum function arguments", function () {
	const args = [];
	let i;

	for (i = 0; i < TEST_MAX_CALL_ARGUMENTS + 1; i++) {
		args.push("'x'");
	}

	assertFailResult(
		ExpressionEngine.tryEvaluateExpression(
			"Concat(" + args.join(",") + ")",
			baseContext
		),
		[
			"Function call exceeds maximum of " +
				TEST_MAX_CALL_ARGUMENTS +
				" arguments"
		],
		"maximum function arguments"
	);
});

runTest("guards maximum IN list size", function () {
	const items = [];
	let i;

	for (i = 0; i < TEST_MAX_LIST_ITEMS + 1; i++) {
		items.push(String(i));
	}

	assertFailResult(
		ExpressionEngine.tryEvaluateExpression(
			"num(srp(Amount)) in (" + items.join(",") + ")",
			baseContext
		),
		["List exceeds maximum size of " + TEST_MAX_LIST_ITEMS + " items"],
		"maximum in list size"
	);
});

console.log("All tests passed.");
