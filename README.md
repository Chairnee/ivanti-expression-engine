# Ivanti Expression Engine

This is a dirty proof of concept domain specific language to reproduce Ivanti expressions within scripting contexts. This proof of concept has been used alongside a custom workflow engine to reproduce a complex request offering workflow of ~100 blocks and over one hundred expressions. The custom solution lives entirely within the Ivanti Service Management System and performs 800x faster than the inbuilt workflow engine in the case of the aforementioned complex workflow.

For example, let's assume that a request offering had this expression to generate a subject line for its service requests.

```
$(if GetSRPValue(RecId, 'drpdown_RequestType') in ("A1", "A2", "A3", "A4", "A5", "A6", "T1") then
    GetSRPValue(RecId, 'drpdown_RequestType') + " - " + GetSRPValue(RecId, 'txt_RequestTitle')
  else
    GetSRPValue(RecId, 'drpdown_RequestType') + " - " + GetSRPValue(RecId, 'txt_RequestVariant')
)
```

This could technically be reproduced by including it at the top of a web service script because it will be evaluated by Ivanti's pre-execution evaluation pass. However, this makes the web service script too tightly coupled to that request offering definition. If the fields the expression references are modified or the script needs to run on other kinds of service requests, the system will immediately abort script execution in a manner that's hard to trace. There are other significant weaknesses with relying on the pre-execution evaluation pass. For one, if there is a need to evaluate an expression stored within `$(EvaluateMe)`, then the pre-execution evaluation pass will merely pull the literal expression string from `$(EvaluateMe)` and not evaluate it.

The Expression Engine proof of concept shows that a complete evaluator can be defined within a WSDL and then used within any other web service script against any business object, not just service requests. It tokenises strings tagged with {{...}}, generates an abstract syntax tree and then evaluates the expression against the current business object. The example Ivanti Expression from earlier can be rewritten in the manner below.

```
{{If(str(srp(drpdown_RequestType)) in ('A1','A2','A3','A4','A5','A6','T1'),
    Concat(str(srp(drpdown_RequestType)),' - ',str(srp(txt_RequestTitle))),
    Concat(str(srp(drpdown_RequestType)),' - ',str(srp(txt_RequestVariant)))
  )
}}
```
