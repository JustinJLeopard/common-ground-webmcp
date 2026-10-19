# WebMCP boundary and remaining deployment proof

The tested boundary is the registered tool interface. Each of the five tools
can read or propose; none can advance the allocation revision. The page and its
bundled scripts are trusted. Human controls can mutate the fictional scenario.
An agent with arbitrary same-origin JavaScript or unrestricted DOM interaction
has more authority than the registered tools: this page does not authenticate a
physical person or isolate its state from a compromised script.

## Threats and source checks

| Surface | Boundary and evidence |
| --- | --- |
| Tool registration and composition | The registered-handler test rejects duplicate names, asserts the exact five names, and runs every real executor in a sequence that preserves allocation bytes and revision. A host that composes additional registrars still needs a browser-level collision test. |
| Tool input and error text | Dynamic activity values are HTML-escaped at the rendering sink, including tool arguments and registration error messages. A regression passes markup directly to the real handler without relying on schema validation. |
| Other HTML templates | Allocation, floor, compromise, protection, and tool-catalog templates interpolate bundled model/catalog values and formatted numeric results. Refusal messages use textContent. Future externally supplied labels must receive the same output treatment. |
| Compromised same-origin scripts | Out of the tool-only boundary: such a script can invoke human controls or exported application functions. Stronger isolation needs a separate authority holder, not another read-only annotation. |
| Dynamic code execution | The current application has no evaluator or dynamic-code bridge. Adding one requires an independently reviewed isolation design with an opaque origin, denied ambient network/storage, an allowlisted bridge, and abort/timeout cleanup. |

## Page policy is a deployment acceptance item

This repository contains one WebMCP-enabled page and no deployment header
configuration. Disabling the capability on that page would also disable its
intended tools. On future documents or frames that should expose no tools, the
deployment candidate is `Permissions-Policy: tools=()`, subject to validation
against the browser and WebMCP version actually deployed.

Issue #1 remains open until the deployment owner records the intended page/frame
policy, observes the actual response headers, and demonstrates in the target
browser both the enabled five-tool page and denied tool access where disabled.
Node tests and a documented header are not that browser proof. This change does
not publish or alter a deployment.
