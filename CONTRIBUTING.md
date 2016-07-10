# Contributing to Simplecrawler

Simplecrawler has benefited enormously from the welcome contributions and
assistance of many generous developers over the years, and contributions, ideas,
and questions into all aspects of Simplecrawler's development are always
welcome.

Before you file a PR or an issue though, please ensure your contribution adheres
to these simple guidelines — it'll make life much easier for both you and the
Simplecrawler project maintainers!

### Before filing your issue

#### Ensure you have tested with the latest version of Simplecrawler from Github.

Occasionally, the Simplecrawler version in npm may lag the Github code, while we
prepare for a release. To ensure you're not filing an issue for something we've
already fixed, this is an important step.

#### Reduce your problem down to a simple test case that can be posted in the issue.

If your code crawls a private website or some resource not available to us, or
uses code to which we do not have access, it is likely that we will be unable to
reproduce the issue you're experiencing, and therefore it will be difficult to
help you.

Take the problem you're experiencing and remove as much extraneous code as
possible, until you've reduced it to the minimum kernel of code which still
exhibits the problem.

#### Endeavour to explain your problem clearly and succintly

So we can understand your problem more easily, ensure your issue description
clearly answers the following questions:

* **What happens? What have you observed?**
* **What do you expect to happen? What should happen?**
* **What are the clear steps for reproducing the problem?** *If you're unsure
  about how you reproduced the problem, we can help — but please post your code
  and the event output you received from the crawler. Guidelines for retrieving
  event output from the crawler can be found in the [FAQ](https://github.com/cgiffard/node-simplecrawler#faqtroubleshooting).*

Answering these questions will make your issue much easier to understand, and to
reproduce. Or, if you're having trouble understanding how to use the crawler —
it will help us to point you in the right direction!

### Before filing your PR

To ensure the standard of code in Simplecrawler remains high, (or gets better!)
all pull requests are required to meet a certain level of code and git hygiene
before being merged.

#### Check Existing PRs

Double check the existing open PRs to ensure somebody hasn't already filed a
similar PR. If they have, perhaps you could contribute to theirs!

#### Commit Hygiene

When committing code, ensure your commit messages are concise, readable, and
roughly follow the following format:

```
[Area of Change]: 50-char message about what changed

[Any issues this change fixes, with the issue number referenced.]

First paragraph explaining the original problem or reason for this feature or
change. Max 80-characters wide.

Subsequent lines explaining the changes that have been made to the code.
```

This ensures that it's easy in future to get an understanding of the history of
a given bit of code — why it is the way it is, and what it's fixing. This style
does not obviate the requirement to comment your code, but it helps to provide
longer rationale for changes.

For example:

```
Crawler: Change 599 to 600 error code

Fixes #219

* In order to avoid ambiguity between internal crawler errors
  and server errors, the 599 code has been moved out of the
  500 range and into the 600 range.
* This has been documented accordingly.
```

##### Splitting commits, WIP commits

PRs with messy commit history or WIP commits will not be merged. After all, once
your WIP commits are merged, they become part of Simplecrawler mainline's
history — and everything gets messy. Squash your commits if required, and
rename any commits with unstructured or unclear messages.

#### Linting

Ensure you have linted your code with ESLint. You may run `npm test` from the
project directory to do this automatically. Code which fails linting in Travis
will not be merged.

#### Spelling

Any code or documentation contributions should be spell-checked to ensure that
variable names, comments, and documentation is of a consistently high standard.
We understand you make mistakes — that's OK (we do too!) But there are automated
tools to help you, and you should use them. We'll check for spelling on your PR,
and will point out any mistakes to you if we find them.

#### Documentation

* Any new functions should have a comment explaining the purpose of the function.
* Any new top level functions (that is, functions exposed on the public
  interface of Simplecrawler or any of its components) should have a JSDoc
  comment explaining the purpose of the function, its arguments, and return
  value.
* Any top level functions, behaviour changes, or interface changes which will
  affect the API and use of Simplecrawler should be similarly represented in
  the README. Please document *any* new events, public functions, and errors
  which might be thrown.

#### Tests

**Any new code contribution must have tests for every behaviour — changing
existing tests where appropriate, or adding new tests.** Code will not be
accepted without clear tests.

Code will not be accepted if the tests do not pass in Travis.

We're more than happy to help you if you get stuck or want some assistance
writing tests!
