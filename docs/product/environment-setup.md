# Preparing execution environments

| Field | Value |
| --- | --- |
| Status | Problem defined; design grill in progress |
| Discovery | [Merging dotfiles and agent-skills](../discovery/merging-dotfiles-and-agent-skills.md) |
| Glossary | [Environment setup](../../CONTEXT.md) |
| Started | 23 August 2026 |

## Trigger

> it's hard to provision in a new environment such as Orb. when i want to help my friends or a sales member setup their machine, i find it hard to explain and too much manual work.

Environment setup depends on the maintainer's hidden knowledge. It remains a service performed manually rather than a product that humans and agents can use independently.

## Problem

There is no single authoritative and testable way to prepare an execution environment for its intended human and agent users.

Required behavior is spread across repositories, platform settings, secrets and local state. Users must know which steps apply, where configuration comes from and whether setup completed correctly.

This makes environments difficult to:

- set up without the maintainer
- explain to non-technical users
- maintain as requirements change
- verify before work starts
- use consistently across personal machines, other people's machines and agent environments

## Product intent

Build an opinionated personal environment product from reusable parts and curated role configurations. It starts from Chinh's working environment, but does not assume Chinh is every environment's user.

A role configuration covers:

- machine setup
- agent behavior
- role-specific workflows

Credentials and work data remain external inputs. A role configuration may declare required access, but it does not own secret values or work data.

The product must be understandable as well as executable. Automation must not turn manual knowledge into a hidden sequence of changes.

The first useful version targets a fresh personal developer Mac. Later rollout tiers add personal developer Linux, agent Orbs, then non-technical Mac or Linux environments.

Mac, Linux, VPS and Amp Orb are concrete instances of one execution environment concept. Each instance has specific capabilities. “Orb” remains the name for Amp's managed environment rather than the generic term.

Automated setup initially supports only a newly installed operating system or newly created Orb with no user-managed configuration. A separate AI skill inspects existing state, produces an explained migration plan, requests full or partial approval, then reconciles only approved changes.

## Setup experience

Setup should minimise interruption without bypassing informed consent:

1. Interview the user to understand their role, intended work, machine, existing setup and constraints.
2. Present a plain-language setup plan.
3. Explain safe changes and execute them without repeated approval.
4. Request separate approval immediately before privileged, secret-related, destructive or difficult-to-reverse changes.
5. Verify the resulting environment.
6. Summarise what changed, why, what remains, and how to update or remove it.

Product principle:

> Ask enough before acting, explain throughout, and interrupt only when the risk changes.

## Success criteria

- A new Orb can prepare and verify the behavior needed by its intended agents without copied lifecycle knowledge.
- A friend or sales team member can set up their machine without Chinh translating undocumented steps.
- A non-technical person can quickly understand what an agent changed on their Mac or Linux machine, without relying on Chinh to reconstruct or explain the setup afterwards.
- An agent can determine which requirements apply to its environment and intended work.
- A user can see what is ready, missing or unsupported before starting work.
- A maintainer can trace each required behavior to one authoritative source.
- Different environments can provide intentionally different capabilities without silent drift.

## Decisions established before the formal grill

These decisions came from the problem-definition conversation before formal grill numbering began.

### Use an opinionated personal product with reusable role configurations

Outcome: Start from Chinh's personal configuration, organise shared behavior as a reusable core, and expose curated role-specific configurations. Do not design a universal framework.

User rationale, verbatim:

> so i would choose 1, with a reusable core with opinionated role-specific cofigurations

Alternatives set aside:

- reproduce Chinh's configuration without reusable role boundaries: set aside because the user added a reusable core and role-specific configurations
- build a completely general framework: set aside because the selected starting point is the personal configuration

### Include education in the product

Outcome: Setup must explain what changes, why the intended role needs it, which risks it carries, how it is verified and how it can be updated or removed.

User rationale, verbatim:

> and alongside this, it should serve educational purpose. imagine you can't let agents setup a salesman macbook without explaining anything - this is the blackbox trail we should prevent.

### Use neutral readiness language

Outcome: Say an environment is ready when it provides required behavior for its intended users. Do not use a person-specific branded term.

User rationale, verbatim:

> ok this is good, but dont use the jargon "Chinh-ready". it's hard to understand, and not everytime I will be the main user. it could be agents

### Minimise approvals after an initial interview

Outcome: Interview the user and explain the plan first. Execute safe changes with minimal interruption. Request separate approval for privileged, secret-related, destructive or difficult-to-reverse changes.

User rationale, verbatim:

> how explanation should control execution: 4 - which means asking user first, grill style, then explain safe changes, execute with minimum asking for approval but request separate approval for privileged, secret-related or destructive changes.

Alternatives set aside:

- explain only after setup: set aside because the user requires an interview and explanation before execution
- request approval for every change: set aside because the user wants minimum approval prompts for safe changes
- run everything after one approval: set aside because sensitive and destructive boundaries need separate approval

### Cover machine setup, agent behavior and role workflows

Outcome: A role configuration controls machine setup, agent behavior and role-specific workflows. Credentials and work data remain external inputs.

User rationale, verbatim: Not provided.

Alternatives set aside:

- machine packages and configuration only: reason not established
- machine setup and agent behavior without role workflows: reason not established
- include credential values and work data: set aside by the external-input boundary presented with the selected option

## Formal design grill

### Round 1

#### Question Q1

Which role configurations must the first useful version prepare and verify?

Why I am asking: The first version needs enough variety to prove the reusable parts without claiming to support every machine and role. This choice sets the reference environments for later primitive and lifecycle decisions.

Options:

- Q1.1: Personal developer Mac only.
- Q1.2: Personal developer Mac and agent Orb.
- Q1.3: Personal developer Mac, non-technical sales Mac or Linux workstation, and agent Orb.
- Q1.4: Every known environment: personal Mac, non-technical Mac or Linux workstation, VPS, local Amp runner and Orb.
- Q1.+: Add another option.

Recommendation: Q1.3. It covers the current personal source, a non-technical human and a remote agent environment while keeping the first version bounded.

Outcome: Selected — Q1.1: Personal developer Mac only. Future rollout is tiered: personal developer Mac or Linux, then Orb, then non-technical Mac or Linux. Start with Mac only.

User rationale, verbatim:

> treat this as tiered levels: personal developer mac/linux > orb > non-tech mac/linux. treat linux workstation or VPS or personal linux the same type as mac. firstly to be easy, start with mac only.

Validated evidence:

- The trigger names Orb setup and machines for friends or sales team members.
- The agreed success criterion names non-technical users on Mac or Linux.
- Discovery confirmed a local macOS setup and separate Debian 12 Orb lifecycle.

Other options at this point:

- Q1.2: Set aside because Orb follows personal developer Mac or Linux in the selected rollout order.
- Q1.3: Set aside because non-technical environments come after Orb and the first version starts with Mac only.
- Q1.4: Set aside because the first version should not support every known environment.
- Q1.+: No additional option provided.

#### Question Q2

How should setup handle a machine that already has tools or configuration?

Why I am asking: Friends and team members may not have fresh machines. The answer determines whether setup is only a bootstrap tool or must safely reconcile existing state.

Options:

- Q2.1: Support fresh environments only and stop when managed state already exists.
- Q2.2: Inspect existing state, keep compatible state, and ask before replacing or conflicting with it.
- Q2.3: Enforce the selected role configuration and overwrite drift after one plan approval.
- Q2.4: Audit existing machines, but automate setup only for fresh environments.
- Q2.+: Add another option.

Recommendation: Q2.2. It can support real machines without silently replacing personal configuration or reducing the product to an audit report.

Outcome: Selected — Q2.1: Support fresh environments only and stop when managed state already exists. Adjustment: provide a separate AI skill to inspect existing state.

Later refinement: Q7 extends the separate skill from read-only inspection to explained, fully or partially approved reconciliation.

User rationale, verbatim:

> i'm considering between Q2.1 and Q2.2, while 2.2 is better but it adds a complex layer on top of a fresh machine. for educational purpose, i think let's start with Q2.1 and provide an AI skill to inspect existing state.

Validated evidence:

- Current Stow installation can conflict with existing target files.
- Current agent projection deletes stale files inside owned runtime subtrees.
- The trigger includes helping other people set up their machines, which may contain existing state.

Other options at this point:

- Q2.2: Set aside for the first version because it adds a complex reconciliation layer, although the user considers it better eventually.
- Q2.3: Reason not established.
- Q2.4: Set aside in favour of fresh-only setup with a separate AI inspection skill.
- Q2.+: No additional option provided.

#### Question Q3

Where should the explanation for each setup change come from?

Why I am asking: If an agent must infer purpose from shell scripts, the product preserves the black box in another form. The explanation needs a dependable source that humans and agents can use.

Options:

- Q3.1: Let the acting agent infer an explanation from scripts and configuration.
- Q3.2: Store an authored purpose, intended user effect, risk, verification and removal guidance with each requirement; let the agent adapt it into concise plain language.
- Q3.3: Keep explanations in separate user documentation maintained alongside setup code.
- Q3.4: Generate only a post-run summary from command results.
- Q3.+: Add another option.

Recommendation: Q3.2. It makes explanation part of the authoritative product definition while allowing an agent to adjust wording for technical and non-technical users.

Outcome: Selected — Q3.2: Store an authored purpose, intended user effect, risk, verification and removal guidance with each requirement; let the agent adapt it into concise plain language.

User rationale, verbatim:

> it should be similar to how the capability docs are documented and defined, then they generate amp plugins/AI skills

Validated evidence:

- The user explicitly rejected an agent-driven setup that cannot explain its changes.
- Current install and projection scripts encode operations, but not a complete per-change user purpose, risk and removal explanation.

Other options at this point:

- Q3.1: Set aside because the explanation should come from a documented definition rather than agent inference.
- Q3.3: Set aside because the documented definition should drive downstream behavior rather than remain separate user documentation.
- Q3.4: Set aside because explanation must exist before generation and execution, not only afterwards.
- Q3.+: No additional option provided.

### Round 2

#### Question Q4

What counts as a fresh environment for automated setup?

Why I am asking: Fresh-only setup needs a precise stopping boundary. A new user account can still contain OS-provided tools, while a recently purchased Mac may already have user applications or settings.

Options:

- Q4.1: Only a newly installed operating system or newly created Orb with no user-managed configuration.
- Q4.2: An environment with no prior product-managed state; unrelated existing tools are allowed, but any conflict stops setup and routes the user to inspection.
- Q4.3: An environment whose existing state already matches the selected role configuration; setup may adopt matching state.
- Q4.+: Add another option.

Recommendation: Q4.2. It keeps reconciliation out of the first version without requiring a factory-reset machine or rejecting harmless preinstalled tools.

Outcome: Selected — Q4.1: Only a newly installed operating system or newly created Orb with no user-managed configuration. Conflicts route to the separate reconciliation skill.

User rationale, verbatim:

> make it simple since the order is: personal developer mac/linux > orb > non-tech mac/linux. when any conflict happens, presume we already have the reconsilation skill.

Validated evidence:

- Current Stow installation can fail when target files already exist.
- Operating systems and Amp Orbs include preinstalled tools before this product runs.
- Q2 selected fresh-only automation and a separate existing-state inspection skill.

Other options at this point:

- Q4.2: Set aside to keep the first setup path simple; conflicts use the separate reconciliation skill.
- Q4.3: Set aside because adopting matching existing state belongs to reconciliation rather than fresh setup.
- Q4.+: No additional option provided.

#### Question Q5

What does it mean to treat Mac, Linux workstation and VPS as the same environment type?

Why I am asking: They can share persistent setup behavior, but a VPS may be headless and use different package, privilege and secret boundaries. The shared concept must not hide these differences.

Options:

- Q5.1: Treat all 3 as persistent hosts; select behavior from detected capabilities such as operating system, interface, privileges and secret access.
- Q5.2: Treat Mac and Linux workstations as one type, but model VPS as a separate server type.
- Q5.3: Treat Mac, Linux workstation and VPS as separate types with shared reusable requirements.
- Q5.+: Add another option.

Recommendation: Q5.1. It preserves the requested common type while making actual behavior depend on explicit capabilities rather than assuming a VPS behaves like a Mac.

Outcome: Selected — Q5.1: Treat all 3 as persistent hosts; select behavior from detected capabilities such as operating system, interface, privileges and secret access. The user delegated the decision. Adjustment: use one execution environment concept for Mac, Linux, VPS and Amp Orb; treat each as a concrete instance with specific capabilities, and reserve “Orb” for Amp's product term.

User rationale, verbatim:

> i meant why do you need to think so much about many machine types, just treat them as specific Orbs.

> choice: you decide

Validated evidence:

- The user asked to treat Linux workstation, VPS and personal Linux as the same type as Mac.
- Discovery found macOS-specific workstation configuration and a separate Debian Orb lifecycle.
- Existing project registry environments already distinguish local, VPS and Amp Orb paths.

Other options at this point:

- Q5.2: Set aside because a separate server type adds a top-level distinction the user does not want.
- Q5.3: Set aside because separate OS and host types add unnecessary taxonomy.
- Q5.+: No additional option provided.

#### Question Q6

Which artifacts should the authored requirement definition generate?

Why I am asking: Q3 made the definition authoritative, but generating executable setup directly from prose can create a different black box. We need to separate generated explanation from reviewed execution logic.

Options:

- Q6.1: Generate documentation only; hand-write and manually align all skills, plugins and setup code.
- Q6.2: Generate documentation, AI skills, plugins and executable setup from the requirement definition.
- Q6.3: Generate documentation and AI guidance from the definition; hand-write executable adapters and validate them against the definition.
- Q6.4: Generate nothing automatically; use repository checks to enforce alignment between authored artifacts.
- Q6.+: Add another option.

Recommendation: Q6.3. It makes explanations and agent guidance consistent without allowing generated prose-to-code behavior to mutate a machine without reviewed execution logic.

Outcome: Deferred.

User rationale, verbatim:

> since explanation can be generated easily, the important thing to write down is the primitives and original intention, why this not that, etc.

> choice: grill more on this question.

Validated evidence:

- Q3 selected a capability-document-like authoritative definition that can produce plugins or AI skills.
- Current Amp capability documents are authoritative, while plugin implementations are reviewed code kept aligned through validation rather than generated from prose.
- The product must explain machine changes and request separate approval at higher-risk boundaries.

Other options at this point:

- Q6.1: Open.
- Q6.2: Open.
- Q6.3: Open.
- Q6.4: Open.
- Q6.+: Open.

#### Question Q7

What may the existing-state inspection skill do?

Why I am asking: Q2 introduced inspection as a companion to fresh-only setup. Its mutation boundary must be explicit or reconciliation complexity will return through the AI skill.

Options:

- Q7.1: Report current state and conflicts only.
- Q7.2: Report current state and produce an explained migration plan, but make no changes.
- Q7.3: Report, plan and apply selected repairs after approval.
- Q7.4: Report current state, produce an explained migration plan, allow full or partial approval, then reconcile only approved changes.
- Q7.+: Add another option.

Recommendation: Q7.2. It serves the educational goal and prepares future reconciliation work without weakening the fresh-only mutation boundary.

Outcome: Selected — Q7.4: Report current state, produce an explained migration plan, allow the user to approve all or selected changes, then reconcile only approved changes.

User rationale, verbatim:

> report current state and produce an explained migration plan. ask for approval (even partial) and reconcile. make it UX easy.

> choice: Q7.+

Validated evidence:

- Q2 selected fresh-only automated setup because reconciliation adds complexity.
- The user requested an AI skill to inspect existing state.
- The product requires explanations before changes and separate approval at higher-risk boundaries.

Other options at this point:

- Q7.1: Set aside because reporting conflicts alone does not provide a migration plan or reconciliation.
- Q7.2: Set aside because the selected option continues into approved reconciliation.
- Q7.3: Set aside because it does not explicitly support partial approval or the requested easy migration experience.
- Q7.+: Assigned to Q7.4.

### Round 3

#### Question Q8

How should fresh setup hand off when it detects existing user-managed state?

Why I am asking: Q4 requires fresh setup to stop, while Q7 provides a reconciliation skill. The handoff determines whether that safety boundary feels like one coherent product or 2 unrelated tools.

Options:

- Q8.1: Stop with an explanation and require the user to invoke the reconciliation skill separately.
- Q8.2: Stop, explain the conflict, and offer to start the reconciliation skill in the same conversation after explicit approval.
- Q8.3: Treat fresh setup and reconciliation as modes of one skill and switch modes after the user confirms.
- Q8.+: Add another option.

Recommendation: Q8.2. It preserves a clear implementation and mutation boundary while giving the user a guided handoff instead of a dead end.

Outcome: Deferred.

User rationale, verbatim: Not provided.

Validated evidence:

- Q4 limits automated setup to an operating system or Orb with no user-managed configuration.
- Q7 creates a separate skill that can reconcile only approved changes.
- The product should minimise interruption without hiding changes or risk transitions.

Other options at this point:

- Q8.1: Open.
- Q8.2: Open.
- Q8.3: Open.
- Q8.+: Open.

#### Question Q9

How should an execution environment's capabilities be established?

Why I am asking: Q5 uses one environment concept instead of separate machine types. Safe behavior now depends on accurate capabilities without making the user describe facts the product can inspect.

Options:

- Q9.1: Declare every capability in the selected role configuration.
- Q9.2: Detect every capability from the environment without asking the user.
- Q9.3: Detect technical facts, ask the user about intent or access that cannot be inferred safely, then show the resolved capabilities before planning changes.
- Q9.4: Ask the user to describe every capability during the initial interview.
- Q9.+: Add another option.

Recommendation: Q9.3. It avoids unnecessary questions, makes uncertain access explicit and gives both humans and agents a reviewable basis for selecting behavior.

Outcome: Deferred.

User rationale, verbatim: Not provided.

Validated evidence:

- Q5 selected one execution environment concept whose concrete instances differ by capabilities.
- Current environments differ in operating system, interface, privileges, secret access and persistence.
- The setup experience already begins with an interview and plain-language plan.

Other options at this point:

- Q9.1: Open.
- Q9.2: Open.
- Q9.3: Open.
- Q9.4: Open.
- Q9.+: Open.

#### Question Q10

What should one core primitive represent?

Why I am asking: Q6 cannot settle generation until “primitive” has a stable meaning. The primitive boundary determines whether the source describes user outcomes, implementation details or arbitrary bundles.

Options:

- Q10.1: One package, file or setting, such as Homebrew, `.zshrc` or an Amp plugin.
- Q10.2: One setup action, such as install a package, link a file or start a service.
- Q10.3: One required user-visible behavior, such as resolve project names, use an editor or let an agent follow role guidance.
- Q10.4: One broad capability bundle containing several related behaviors and implementation steps.
- Q10.+: Add another option.

Recommendation: Q10.3. It keeps the authoritative source focused on why the environment needs something, while adapters remain free to implement that behavior differently on Mac, Linux or Orb.

Outcome: Deferred.

User rationale, verbatim: Not provided.

Validated evidence:

- The glossary already distinguishes required behavior from files, packages and configuration.
- Q6 prioritises primitives, original intention and “why this not that”.
- Current repositories mix package, file, script and user-behavior boundaries.

Other options at this point:

- Q10.1: Open.
- Q10.2: Open.
- Q10.3: Open.
- Q10.4: Open.
- Q10.+: Open.

#### Question Q11

What must be authored for each primitive?

Why I am asking: Generated explanation is only trustworthy if the source preserves enough intent and operational boundaries. Recording too little recreates inference; requiring an essay for everything makes maintenance impractical.

Options:

- Q11.1: Name, short purpose and implementation reference only.
- Q11.2: Purpose, intended users, applicability, dependencies, risk, required behavior, verification and removal guidance.
- Q11.3: A full decision essay for every primitive, including all considered alternatives and implementation history.
- Q11.4: Use the concise contract in Q11.2 for every primitive, plus a separate decision record only when a meaningful trade-off or surprising constraint needs its rationale preserved.
- Q11.+: Add another option.

Recommendation: Q11.4. It records enough structured intent to explain and verify every primitive while reserving longer “why this, not that” records for decisions that genuinely need them.

Outcome: Deferred.

User rationale, verbatim: Not provided.

Validated evidence:

- The user said original intention and “why this not that” are more important to author than generated explanation.
- Existing Amp capability documents separate behavior contracts from implementations.
- The repository already uses RFCs for larger trade-offs and capability docs for operational contracts.

Other options at this point:

- Q11.1: Open.
- Q11.2: Open.
- Q11.3: Open.
- Q11.4: Open.
- Q11.+: Open.
