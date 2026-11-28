# **1. Project & Team Information**

| Project Name:                       | Highrable                                                  |
| :---------------------------------- | :--------------------------------------------------------- |
| **Builder / Team Name:**            | SABAC                                                      |
| **Primary Contact (Name + Email):** | Christelle Anne Dacapias — chrissstellee@gmail.com         |
| **Ambassador Chapter:**             | Philippines                                                |
| **Ambassador Chapter Lead:**        | Nelson Tung Lumbres                                        |
| **Date Submitted:**                 | November 16, 2026                                          |
| **Suggested Sprint Start Date:**    | 7 calendar days after Instawards approval                  |
| **Public Repository**               | https://github.com/Carts1024/Highrable-Stellar             |
| **XLM Mainnet Wallet**              | `GDIXHECIHT6KCWFT7K4H2NIEZCILGAUTE6IXSHPJ6EYCUWMXK6AURV2M` |

# **2. Instawards Overview & Intent**

## **2.1 Instawards Purpose (for Builder Context)**

Instawards support short, clearly scoped, execution-focused development work that can be completed and demonstrated within 30 days or less. This SOW defines the technical deliverables, success criteria, evidence, and budget for Highrable’s proposed 30-day service-marketplace sprint.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified. The numerical targets below are proposed sprint commitments, not claims of completed work.

# **3. Problem Statement & Objective**

| Item                            | Prompt                                                                                            | Response                                                                                                                                                                                                                                                                                                                                                                                            |
| :------------------------------ | :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem Being Addressed**     | What specific problem, gap, or blocker is this Instaward intended to solve?                       | Highrable’s current marketplace centers on clients posting jobs, which makes it harder for freelancers to proactively showcase and offer their services. Clients also lack a service-first way to discover freelancers and move from an inquiry to agreed terms and escrow-backed work.                                                                                                             |
| **Objective of This Instaward** | In one or two sentences, what will be true at the end of 30 days if this Instaward is successful? | By the end of 30 days, Highrable will let freelancers publish service listings that clients can discover and request, discuss privately, and agree on through a custom offer before funding. The accepted offer will link to a Stellar Testnet escrow for funding, work submission and revisions, and payment release, with confirmed transaction outcomes accurately reflected in the application. |

## **3.1 Project Overview**

Highrable is a Stellar-native freelance marketplace that uses Soroban escrow to support payment-backed freelance work. This sprint adds a service-first path alongside the existing client-posted job flow: freelancers publish services, clients discover and request them, participants agree to a custom offer, and accepted work proceeds through Testnet escrow funding, submission, and payment release.

The sprint treats the current marketplace, chat, agreement, escrow, submission, revision, and dispute implementations as integration candidates. Existing code must be checked against the new service flow; its presence alone does not demonstrate that the new flow is implemented.

## **3.2 Target Users**

Highrable’s development sprint is focused on the following users:

1. **Freelancers** who want to publish services and receive requests from prospective clients.
2. **Clients and employers** who want to discover freelancers, discuss scope privately, and agree on custom terms before funding work.
3. **Web2 users entering Web3 payments** who need understandable wallet and transaction flows for escrow-backed work.
4. **Stellar ecosystem reviewers and developers** who need open-source implementation details and verifiable Testnet evidence.

## **3.3 Key Outcomes**

At the completion of the 30-day development sprint, the project aims to deliver a functional service-marketplace path from freelancer listing through client request, accepted offer, escrow-backed work, and payment release.

**Technical Outcomes**

1. Service listings can be created and managed by their freelancer owners and discovered by clients.
2. A “Request this service” action creates an off-chain inquiry and private participant conversation.
3. Freelancers can propose custom offers; clients can accept or decline them, and the accepted offer version is recorded before funding.
4. Each funded service order links its accepted offer to an application escrow record and a Stellar Testnet escrow identifier.
5. Work submission, applicable revisions, funding, and release are integrated with the appropriate off-chain records and on-chain transaction states.
6. Confirmed escrow outcomes are reconciled from Soroban and displayed accurately in the application.

**User Outcomes**

Following implementation, platform users will be able to:

1. Find and review freelancer-authored service listings.
2. Request a service and discuss scope privately with the freelancer.
3. Review and accept a custom offer before the client funds the work.
4. Follow the work through submission, supported revision cycles, and payment release with visible transaction status.

## **3.4 The Gap and Existing Solutions**

Highrable’s current marketplace is centered on client-posted jobs and applications. Freelancers who want to sell a defined service do not yet have the matching service-listing path where clients can discover those offerings and start a direct service inquiry. As a result, the current entry point does not fit a common service-first hiring pattern.

The proposed module addresses that gap by adding freelancer-authored listings and connecting each request to private discussion, an explicitly accepted custom offer, and an offer-linked escrow workflow. Listing, inquiry, conversation, and offer records remain off-chain. Escrow funding and payment release are on-chain Testnet transactions. Work files and descriptive submission details remain off-chain; any escrow state transition uses the configured contract transaction path.

Current implementation areas are integration candidates, not assumed completed support for this flow:

| Candidate area                 | Current repository reference                                                                                                                                                                                                   | Sprint assessment                                                                                                                                                            |
| :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job marketplace and discovery  | [`marketplace-page.tsx`](../../apps/web/features/marketplace/marketplace-page.tsx), [`create-job-form.tsx`](../../apps/web/features/marketplace/components/create-job-form.tsx), [`jobs`](../../packages/backend/convex/jobs/) | Existing paths center on client-posted jobs and applications. Assess reusable search, listing, and safety patterns; implement the freelancer service-listing path as needed. |
| Conversations and chat         | [`conversations`](../../packages/backend/convex/conversations/), [`conversation-thread.tsx`](../../apps/web/features/chat/components/conversation-thread.tsx)                                                                  | Verify inquiry parent relationships, participant authorization, and privacy behavior before adapting chat.                                                                   |
| Work agreements                | [`work_agreements`](../../packages/backend/convex/work_agreements/)                                                                                                                                                            | Verify whether the current job-scoped lifecycle can represent custom offer versions and acceptance. Adapt or add the required association if not.                            |
| Escrow                         | [`escrows`](../../packages/backend/convex/escrows/), [`escrow contract`](../../contracts/escrow/src/lib.rs)                                                                                                                    | Verify offer association, Testnet deployment identity, transaction tracking, and result reconciliation.                                                                      |
| Work submissions and revisions | [`work_submissions`](../../packages/backend/convex/work_submissions/), [`revisions`](../../packages/backend/convex/revisions/)                                                                                                 | Verify that work and revision records can be scoped to the accepted offer and associated escrow.                                                                             |
| Dispute handling               | [`disputes`](../../packages/backend/convex/disputes/), [`escrow contract`](../../contracts/escrow/src/lib.rs)                                                                                                                  | Preserve safe compatibility where relevant. New dispute-management capabilities are outside this sprint.                                                                     |

## **3.5 Why Stellar & Ecosystem Impact**

Freelance work often involves a payment commitment before work begins, review of a submitted deliverable, and a clear release of payment. Stellar and Soroban provide Highrable with an on-chain escrow path whose funding and release transactions can be verified independently from off-chain listing, conversation, and offer records.

For this sprint, Stellar contributes:

- **Soroban escrow integration:** Connect accepted service terms to the configured escrow transaction flow.
- **Verifiable payment activity:** Capture Testnet transaction references for funding and release and compare the contract outcome with the application display.
- **Wallet-based signing:** Keep transaction approval explicit and show pending, failed, uncertain, and confirmed states clearly.
- **Open-source ecosystem value:** Produce reusable marketplace integration work and reviewer-readable evidence for a service-first Stellar application.

All demonstrations use Stellar Testnet and test accounts. This sprint does not deploy to production or use real user funds.

## **3.6 Existing Approaches**

This comparison focuses on the publicly documented workflows most relevant to Highrable’s proposed service-listing, custom-offer, and escrow flow. “Key limitation” describes a documented workflow constraint or likely user friction, not a general assessment of platform quality. Sources were reviewed on November 17, 2026; features and terms may change.

| **Platform**                                                                                                  | **Primary Focus**                                                                                                                                                                                                                                | **Key Limitation relative to Highrable’s proposed flow**                                                                                                                                                                                                                                                                      |
| :------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Upwork](https://support.upwork.com/hc/en-us/articles/4407894848659-How-to-find-a-project-in-Project-Catalog) | General freelance marketplace with client-posted jobs and Project Catalog offerings created by freelancers, including packaged scope, price, and delivery timelines.                                                                             | Project Catalog listings are reviewed before publication; Upwork says review can take a few weeks for many freelancers, which may slow the launch or revision of a service listing. ([Project Catalog review process](https://support.upwork.com/hc/en-us/articles/4408644453395-How-we-review-your-Project-Catalog-project)) |
| [Fiverr](https://help.fiverr.com/hc/en-us/articles/360010559198-Creating-and-managing-custom-offers)          | Gig and service marketplace where freelancers publish offers and can send custom offers; clients can accept, decline, or request changes.                                                                                                        | Milestone and subscription custom offers are available only in specific categories, so the offer structure depends on category eligibility. ([Custom offer rules](https://help.fiverr.com/hc/en-us/articles/360010559198-Creating-and-managing-custom-offers))                                                                |
| [Freelancer.com](https://www.freelancer.com/support/payments/proposed-milestones-1636?w=f)                    | Project bidding and freelancer services, with proposed milestones and platform Milestone Payments for funded work.                                                                                                                               | Its support FAQ currently marks the service-finding feature as under maintenance, so clients may need to rely on project browsing and bidding while service discovery is unavailable. ([Services FAQ](https://www.freelancer.com/faq/view.php))                                                                               |
| [Contra](https://contra.com/how-it-works/independents)                                                        | Independent-focused work platform with freelancer portfolios and services, opportunity discovery, contracts, project management, messaging, and payments.                                                                                        | Some portfolio customization, search priority, and analytics features are listed as Contra Pro benefits, so enhanced discovery tools are tier-dependent. ([Contra plans and features](https://contra.com/how-it-works/independents))                                                                                          |
| [LaborX](https://laborx.com/about-us)                                                                         | Crypto freelance marketplace with jobs and Gigs, digital work contracts, smart-contract escrow, milestone-based settlement, and dispute resolution.                                                                                              | Its crypto-oriented agreement and escrow flow may add wallet or digital-asset setup steps for clients and freelancers who are unfamiliar with crypto payments. ([LaborX workflow](https://laborx.com/about-us))                                                                                                               |
| [CryptoTask](https://www.cryptotask.org/en?lang=en)                                                           | Decentralized freelance marketplace for job posts, freelancer discovery, crypto payments, smart-contract escrow, and blockchain reputation.                                                                                                      | Its published payment flow centers on cryptocurrency; clients who prefer conventional card checkout may face extra payment setup. ([CryptoTask payment options](https://www.cryptotask.org/en/info))                                                                                                                          |
| **Highrable**                                                                                                 | Stellar-native service marketplace centered on freelancer listings, client requests, private inquiries, accepted custom offers, and escrow-backed work. ([Current marketplace source](../../apps/web/features/marketplace/marketplace-page.tsx)) | The initial flow requires a client request and an accepted custom offer before funding; instant package checkout and algorithmic recommendations are outside the planned scope.                                                                                                                                               |

## **3.7 Validation Scope & Practical Use Cases**

**Validation Scope**

All live transaction validation will use Stellar Testnet after the network and deployed contract identity have been verified; no real user funds or production deployment will be used. The team will record at least five complete service-to-release demonstrations, each with funding and payment-release transaction references. Automated tests will cover the delivered listing, inquiry, offer, authorization, offer-to-escrow association, transaction recovery, and outcome display. Local mocks may support automated tests, but they will not be presented as live Testnet evidence.

**Practical Use Cases**

1. A client discovers a freelancer’s service, requests it, agrees to a custom offer, funds the linked escrow, reviews submitted work, and releases payment.
2. A freelancer revises a proposed offer; the client accepts the current version, and the escrow record references that accepted version.
3. A client requests a revision, the freelancer resubmits work, and the client releases payment after review.
4. An unrelated account attempts to access an inquiry or offer and is rejected; the authorized participants then complete the service workflow.
5. A pending or uncertain Testnet transaction is reconciled against its original reference before the UI displays the confirmed escrow outcome.

## **3.8 Sprint Constraints & Targets**

**Sprint Constraints**

- 30-day implementation sprint, starting 7 calendar days after Instawards approval.
- Stellar Testnet only for chain demonstrations; no real user funds or production deployment.
- Four technical roles only: Soroban contract and Testnet verification; Convex backend and authorization; Frontend 1 for listings and discovery; Frontend 2 for inquiries, offers, and participant escrow experience. Every role contributes code or tests in every sprint week.
- The first client action is **“Request this service.”** A custom offer must be explicitly accepted before funding.
- Listings, inquiries, messages, offers, and work-submission content are off-chain application data. Escrow funding and release are on-chain Testnet transactions.
- Existing chat, agreement, escrow, submission, revision, and dispute capabilities are integration candidates and require flow-specific verification.
- No formal third-party smart-contract audit.
- No unrelated wallet, payment-gateway, reputation, native mobile, or multi-chain features.
- No non-engineering budget lines. Pre-approval work cannot be submitted as completion evidence.

**Sprint Targets**

At the end of the sprint, the project aims to achieve the following proposed targets:

- Four active role-specific branches.
- Four substantive, attributable, merged pull requests.
- Weekly code or test commits from all four funded engineers.
- At least 20 passing automated tests across relevant layers, with zero required failures.
- At least five complete Stellar Testnet service-to-release demonstrations.
- A funding and release transaction reference for every demonstration.
- Unauthorized inquiry/offer access attempts rejected by backend authorization.
- Accepted-offer identifiers and versions linked to the correct escrow and work records.
- Application escrow outcomes matching the demonstrated Soroban outcomes.
- A simple evidence package: one reviewer demo link, one screenshot sheet with four key screens, one repository link, a brief test summary, and one Testnet transaction list for the five demonstrations.

### **3.8.1 Adoption Targets**

Adoption targets measure completion of the proposed flow and its usability for internal validation and review.

| Adoption Target                                         | Target                         |
| :------------------------------------------------------ | :----------------------------- |
| Published service listings available for demonstrations | At least 5                     |
| Service inquiries completed by test participants        | At least 5                     |
| Accepted custom offers linked to escrow                 | At least 5                     |
| Complete service-to-release Testnet demonstrations      | At least 5                     |
| Internal validation users                               | At least 3 users               |
| Unauthorized inquiry/offer access attempts rejected     | 100% of defined negative cases |
| Reviewer-accessible deployment                          | Available                      |
| Stellar Testnet validation                              | Completed                      |

### **3.8.2 Transaction Targets**

The project validates the relationship between accepted off-chain terms and authoritative on-chain escrow outcomes through controlled Stellar Testnet demonstrations.

| Transaction Target                                             | Target                                          |
| :------------------------------------------------------------- | :---------------------------------------------- |
| Demonstrations with accepted offer linked to correct escrow    | 100% of demonstrated funded service orders      |
| Funding transaction references                                 | At least 5, one for each complete demonstration |
| Payment release transaction references                         | At least 5, one for each complete demonstration |
| Displayed escrow outcomes matching confirmed contract outcomes | 100% of demonstrated settlements                |
| Duplicate transaction caused by uncertain retry                | 0                                               |
| Offer or escrow writes accepted from unauthorized actors       | 0                                               |
| Required automated test failures                               | 0                                               |

## **3.9 How It Works**

Freelancer creates and publishes a service listing  
↓  
Client discovers the service and selects **“Request this service”**  
↓  
Highrable creates an off-chain inquiry and private conversation for the client and freelancer  
↓  
Client and freelancer discuss the scope; freelancer proposes or revises a custom offer  
↓  
Client accepts the current custom offer version  
↓  
Highrable records the accepted offer and creates or references an off-chain escrow record linked to it  
↓  
Client funds the escrow through the Stellar Testnet payment flow  
↓  
Escrow funding is confirmed on-chain and synced to Highrable’s off-chain records  
↓  
Freelancer submits completed work through the platform  
↓  
Client reviews the submitted work and may approve it, request a revision, or use a compatible existing cancellation or dispute path if available

**If approved:**  
Soroban escrow logic releases payment to the freelancer  
↓  
The confirmed transaction status and Stellar Expert link are displayed for verification

**If a revision is requested:**  
The freelancer revises and resubmits the work through the platform  
↓  
The client reviews the resubmitted work

**If cancelled:**  
Where the verified existing escrow flow supports cancellation, the contract processes the outcome according to its rules  
↓  
The confirmed transaction status and explorer link are displayed for verification

**If disputed:**  
If the existing dispute flow is verified as compatible with the service-linked escrow, the case follows that flow; this sprint does not add dispute-management features  
↓  
Escrow funds remain subject to the contract’s dispute state until an authorized on-chain outcome is confirmed  
↓  
The confirmed transaction status and explorer link are displayed for verification

Listings, inquiries, conversations, offers, and work-submission content are off-chain. Escrow funding and payment release are on-chain. Application records link the accepted offer and work to the escrow but do not replace Soroban as the source of truth for funds or confirmed settlement status. Cancellation and dispute paths are integration candidates only and must be verified before being demonstrated as part of this service flow.

## **3.10 Technical Milestones**

| Milestone                                          | Description                                                                                                                                                                    | Expected Output                                                                                                                          |
| :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Milestone 1 — Baseline and flow contract**       | Review candidate modules; define listing, inquiry, offer, acceptance, authorization, and offer-to-escrow relationships. Verify Testnet deployment identity before live claims. | Reviewed source-to-scope gap list, agreed data/API contracts, acceptance matrix, initial test cases.                                     |
| **Milestone 2 — Listings, discovery, and inquiry** | Implement freelancer listing management, client discovery, “Request this service,” and private participant-scoped inquiries.                                                   | Reviewable listing and inquiry paths, listing screenshots, ownership and privacy evidence.                                               |
| **Milestone 3 — Offers and acceptance**            | Implement custom offer proposal/revision, client accept/decline, accepted-version tracking, and acceptance-before-funding guards.                                              | Reviewable private discussion and offer flow; evidence that only the accepted version can proceed.                                       |
| **Milestone 4 — Escrow, work, and review handoff** | Link accepted offers to escrow; integrate Testnet funding, work submission, applicable revision, release, reconciliation, tests, and reviewer materials.                       | Five complete Testnet demonstrations with funding/release references, at least 20 passing relevant tests, and a simple evidence package. |

## **3.11 Security Considerations**

Security is important because the service flow combines private off-chain discussions and offers with wallet-authorized escrow transactions. The following controls are proposed for implementation and verification:

| Risk                                                     | Mitigation / Security Control                                                                                                                                           |
| :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthorized inquiry, message, offer, or work access     | Enforce participant authorization in trusted backend reads and writes; frontend visibility is not an authorization boundary.                                            |
| Client funds an unaccepted or stale offer                | Validate client acceptance of the current offer version before enabling or processing escrow creation.                                                                  |
| Offer linked to the wrong escrow or participant          | Validate listing, inquiry, client, freelancer, accepted offer/version, escrow, asset, and amount relationships before writes and transactions.                          |
| Duplicate escrow or offer acceptance                     | Use idempotent operation identifiers and enforce a single valid active association for the accepted offer unless an explicitly reviewed product rule permits otherwise. |
| Wrong network or contract                                | Validate configured Stellar Testnet, contract ID, escrow ID, and deployment identity before live transactions and evidence claims.                                      |
| Duplicate transaction after uncertain submission         | Persist transaction identity and reconcile the original hash and contract state before allowing a new attempt.                                                          |
| Application displays an unconfirmed or incorrect outcome | Treat confirmed Soroban state as authoritative; distinguish pending, failed, uncertain, and confirmed states in the UI.                                                 |
| Attachment or work-file exposure                         | Validate attachment ownership and association with the authorized inquiry or work item before retrieval.                                                                |
| Offer or transaction data is changed without trace       | Preserve accepted offer version, actor, timestamps, state transitions, and transaction references in application records.                                               |

# **4. Scope of Work (30-Day Deliverables)**

## **4.1 In-Scope Deliverables**

| Deliverable                                   | Description (What will be built or produced?)                                                                                                                                                                             | Why this matters                                                                                      |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------- |
| **1. Service Listings and Discovery**         | Freelancer listing creation, editing, publishing and unpublishing; client search, filters, and listing details; clear “Request this service” entry point. Enforce listing ownership and visibility.                       | Lets freelancers proactively offer services and gives clients a service-first way to find them.       |
| **2. Inquiries and Private Discussion**       | Create an off-chain inquiry from a service request and connect it to a private conversation between the client and listing owner. Enforce participant-scoped reads and writes.                                            | Gives both participants a private place to clarify scope without treating messages as accepted terms. |
| **3. Custom Offers and Client Acceptance**    | Support custom offer proposal, revision, accept/decline, and accepted-version history. Require explicit client acceptance before funding and preserve the offer/version identity for downstream records.                  | Makes scope and payment terms explicit before funds are committed.                                    |
| **4. Escrow-Backed Work and Payment Release** | Associate the accepted offer with its escrow; integrate Testnet funding, work submission, applicable revisions, and on-chain release; reconcile confirmed contract state and transaction references into the application. | Connects service discovery and agreed terms to verifiable escrow-backed work and payment outcomes.    |

**Out-of-Scope (Explicitly Not Included)**

- Production deployment, mainnet transactions, or settlement with real user funds.
- Formal third-party smart-contract audit.
- Automated judgment of submitted work or disputes.
- New dispute-management features beyond safe compatibility with existing work and escrow records.
- General replacement of the client-posted job marketplace.
- New wallet, payment-gateway, reputation, recommendation, native mobile, or multi-chain features.
- Long-term operations and non-engineering activities.
- Pre-approval work submitted as completion evidence.

## **4.2 Deliverable-Aligned Budget Request**

| Requested Budget Amount  | Rationale for Budget Request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **$5,000.00 USD**        | This technical-only budget is payment for the four engineers only. It covers their planned implementation, integration, testing, bug fixing, and evidence preparation for the 30-day service-marketplace sprint. No funds are requested for infrastructure, hosting, or other expenses.<br><br>**Soroban Smart Contract Engineer — $1,500.** Budgeted for **60 engineering hours** over the 30-day sprint, averaging **15 hours per week** at a planning rate of **$25 per hour**, for a total of **$1,500**. Time covers escrow transaction compatibility, funding and release behavior, contract authorization and state checks, Rust testing, Testnet verification, and application integration.<br><br>**Convex Backend Engineer — $1,500.** Budgeted for **60 engineering hours**, averaging **15 hours per week** at **$25 per hour**, for a total of **$1,500**. Work includes service-listing, inquiry, and custom-offer data models; participant authorization; accepted-offer-to-escrow association; transaction status synchronization; audit history; automated testing; and backend integration.<br><br>**Frontend Engineer 1 — $1,000.** Budgeted for **40 engineering hours**, averaging **10 hours per week** at **$25 per hour**, for a total of **$1,000**. Hours cover freelancer listing creation and management, client service discovery and search, listing details, the “Request this service” entry point, frontend testing, and integration with the backend.<br><br>**Frontend Engineer 2 — $1,000.** Budgeted for **40 engineering hours**, averaging **10 hours per week** at **$25 per hour**, for a total of **$1,000**. Work includes private inquiry and conversation surfaces, custom offer proposal and acceptance, participant-facing escrow and work status, transaction feedback, frontend testing, and integration.<br><br>**Total: 200 engineering hours and $5,000.** The Soroban Smart Contract Engineer and Convex Backend Engineer are each allocated 60 hours; each frontend engineer is allocated 40 hours. Every funded engineer must contribute substantive code or tests in each sprint week and provide branch, weekly commit, pull-request, test, and merge evidence. The **$25 per hour** figure is a planning rate and is not an invoiced-timesheet requirement unless Instawards requests timesheets. |
| **Total: $5,000.00 USD** | Payment for the four engineering roles only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

# **5. 30-Day Execution Plan & Timeline**

## **5.1 Weekly Breakdown**

Every role contributes code or tests in each week. Branch and pull-request names are proposed working conventions; the final evidence package will link the actual repository refs.

|          Week           | Planned Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Expected Output                                                                                                                                                                                                           |
| :---------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  **Week 1 — Days 1–7**  | Soroban engineer verifies the escrow transaction/deployment boundary and adds or updates focused contract fixtures. Backend engineer defines listing, inquiry, offer, and escrow relationships and authorization contracts. Frontend 1 maps listing/discovery states and implements an initial listing slice or tests. Frontend 2 maps inquiry, offer, and wallet states and implements an initial interaction slice or tests. All four review candidate modules and freeze interfaces. | Source-to-scope gap list, agreed flow/API contract, initial implementation and test commits from all roles, Testnet identity recorded before live claims.                                                                 |
| **Week 2 — Days 8–14**  | Backend and Frontend 1 implement service listing management and discovery. Backend and Frontend 2 implement inquiry creation and private conversation integration. Soroban engineer adds or updates transaction compatibility fixtures and tests. Each role contributes code or tests and reviews the cross-layer handoff.                                                                                                                                                              | Listing create/manage, search/filter, detail, “Request this service,” and private inquiry path; ownership/privacy tests and screenshots.                                                                                  |
| **Week 3 — Days 15–21** | Backend engineer implements offer/version records, access checks, accepted-offer invariants, and escrow association. Frontend 2 builds offer proposal and client acceptance; Frontend 1 completes listing-to-inquiry navigation and related tests. Soroban engineer locks the transaction parameters and contract state checks needed by accepted offers.                                                                                                                               | Private inquiry and offer flow; accepted offer/version is traceable and funding is blocked until acceptance; unauthorized access evidence.                                                                                |
| **Week 4 — Days 22–30** | All roles integrate accepted offers with Testnet funding, work submission, applicable revisions, and release. Soroban engineer verifies transactions and contract outcomes; backend engineer reconciles records; both frontend engineers complete participant flows and outcome display. Run the relevant suites, capture five demonstrations, and prepare the reviewer package.                                                                                                        | At least five complete Testnet demonstrations; funding and release references for each; at least 20 relevant passing automated tests; one demo link, one screenshot sheet, one repository link, and a brief test summary. |

# **6. Evidence of Completion (Required)**

**Important guidance:** Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead with minimal technical expertise. The links and references below must contain actual sprint results before the work is submitted as complete.

## **6.1 Planned Evidence to Be Submitted**

| Deliverable                                               | Evidence Type (link, repo, demo, screenshot, doc, transaction reference, etc.)                                                                                                                                         | Description and reviewer verification                                                                                                                                                      |
| :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deliverable 1: Service Listings and Discovery**         | Include the listing and discovery screen in the screenshot sheet.                                                                                                                                                      | Confirm the service can be found and “Request this service” starts an inquiry without funding escrow.                                                                                      |
| **Deliverable 2: Inquiries and Private Discussion**       | Include the inquiry or private discussion screen in the screenshot sheet; the brief test summary includes the unauthorized-access check.                                                                               | Confirm the inquiry is private to its participants and that an unrelated account is rejected.                                                                                              |
| **Deliverable 3: Custom Offers and Client Acceptance**    | Include the accepted offer screen, offer ID, and version in the screenshot sheet.                                                                                                                                      | Confirm the displayed agreed offer is the one associated with the funded service order.                                                                                                    |
| **Deliverable 4: Escrow-Backed Work and Payment Release** | Include submitted work and the displayed escrow outcome in the screenshot sheet; provide one compact transaction list with offer ID, escrow ID, and funding and release Testnet links for each of five demonstrations. | Open the transaction links and confirm the displayed outcome matches the confirmed Testnet result and the accepted offer is linked to that escrow.                                         |
| **Shared evidence**                                       | One reviewer demo link, one screenshot sheet with four key screens, one repository link, and one brief test summary.                                                                                                   | The summary reports the number of relevant passing tests (target: at least 20) and confirms the checks for unauthorized access, offer-to-escrow association, and accurate outcome display. |

## **6.2 Evidence Verification Checklist (For Ambassador Use)**

For each deliverable, the Ambassador Chapter Lead will assess whether evidence is present and sufficient.

| Deliverable                                                | Evidence Present | Evidence Partial | Evidence Missing | Comments |
| :--------------------------------------------------------- | :--------------: | :--------------: | :--------------: | :------- |
| Deliverable 1 — Service Listings and Discovery             |        ☐         |        ☐         |        ☐         |          |
| Deliverable 2 — Inquiries and Private Discussion           |        ☐         |        ☐         |        ☐         |          |
| Deliverable 3 — Custom Offers and Client Acceptance        |        ☐         |        ☐         |        ☐         |          |
| Deliverable 4 — Escrow-Backed Work and Payment Release     |        ☐         |        ☐         |        ☐         |          |
| Shared evidence: demo, repository, and test summary        |        ☐         |        ☐         |        ☐         |          |
| Five Testnet demonstrations with funding and release links |        ☐         |        ☐         |        ☐         |          |

## **6.3 Success Metrics**

All numerical values are proposed sprint targets and must be reported with actual results at completion.

| Metric                                                                                                                                                  | Target                |
| :------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------- |
| Planned engineering effort for the four engineers                                                                                                       | 200 hours             |
| Soroban Smart Contract Engineer planned effort                                                                                                          | 60 hours              |
| Convex Backend Engineer planned effort                                                                                                                  | 60 hours              |
| Frontend Engineer 1 planned effort                                                                                                                      | 40 hours              |
| Frontend Engineer 2 planned effort                                                                                                                      | 40 hours              |
| Sprint weeks with substantive code or test commits from all four engineers                                                                              | 4 of 4                |
| Active role-specific branches                                                                                                                           | 4                     |
| Attributable substantive pull requests merged                                                                                                           | 4                     |
| Soroban contract tests relevant to the flow                                                                                                             | At least 5            |
| Convex backend tests relevant to the flow                                                                                                               | At least 8            |
| Listing, inquiry, and offer interface tests                                                                                                             | At least 4            |
| Cross-layer integration and transaction-outcome tests                                                                                                   | At least 3            |
| Total relevant automated tests                                                                                                                          | At least 20           |
| Required automated test failures                                                                                                                        | 0                     |
| Complete service-to-release Stellar Testnet demonstrations                                                                                              | At least 5            |
| Funding transaction references submitted                                                                                                                | At least 5            |
| Payment release transaction references submitted                                                                                                        | At least 5            |
| Accepted offers linked to their demonstrated escrow and work records                                                                                    | 100%                  |
| Unauthorized inquiry/offer access negative cases rejected                                                                                               | 100% of defined cases |
| Demonstrated application outcomes matching confirmed Soroban outcomes                                                                                   | 100%                  |
| Simple evidence package: demo link, one screenshot sheet, repository link, brief test summary, and one transaction list with five funding/release pairs | Submitted             |

# **7. Next-Step Alignment**

## **7.1 Anticipated Next Step After Completion**

After this Instaward, the most likely next step is:

- ☐ Apply to SCF Build Award
- ☐ Continue development independently
- ☐ Apply for a follow-on Instaward (if eligible)
- ☐ Seek other ecosystem support
- ☐ Other: `____________________________________`

# **8. Instawards Constraints Acknowledgement**

By submitting this SOW, the Builder acknowledges:

- This scope will be completed within **30 days or less**.
- Instawards support execution, not open-ended exploration.
- A project may receive **no more than two follow-on Instawards**.
- Each Instaward is capped at **$5,000**.
- Total Instawards funding may not exceed **$15,000**.
