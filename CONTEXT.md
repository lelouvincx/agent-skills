# Environment setup

This context describes the product language for preparing environments that humans and agents can understand, use and verify.

## Language

**Execution environment**:
A place where intended human or agent users do work, such as a personal workstation, VPS, local Amp process or Amp-managed Orb.
_Avoid_: Runner as an umbrella term, because Amp uses runner for a specific executor type

**Intended user**:
A human or agent whose work the execution environment must support.
_Avoid_: Chinh as the default user, owner

**Required behavior**:
An observable behavior that an intended user needs from an execution environment.
_Avoid_: File, package or configuration as a synonym

**Ready**:
An execution environment is ready when it provides the required behavior for its intended users.
_Avoid_: Chinh-ready, runtime-ready

**Setup**:
The process that prepares and verifies an execution environment for its intended users.
_Avoid_: Provisioning when writing for non-technical users

**Role configuration**:
An opinionated set of required behaviors for a type of work and its intended users. It covers machine setup, agent behavior and role-specific workflows, but not credential values or work data.
_Avoid_: Universal configuration, user clone

**Rollout tier**:
An ordered stage in which the product adds support for a group of execution environments and intended users. It describes delivery order, not importance or privilege.
_Avoid_: Capability tier, support class

**Inspection**:
A read-only evaluation of an existing execution environment against a role configuration.
_Avoid_: Setup, repair

**Environment characteristic**:
An observed fact that affects which required behavior applies, such as operating system, interface, persistence, privileges or secret access.
_Avoid_: A separate environment type for every combination of characteristics

**Reconciliation**:
An approved process that changes an existing execution environment towards a selected role configuration. It applies only changes that the user approved from an explained migration plan.
_Avoid_: Inspection, silent repair
