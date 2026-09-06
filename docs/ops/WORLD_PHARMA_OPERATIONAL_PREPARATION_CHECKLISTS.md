# WORLD_PHARMA — Operational Preparation Checklists (Draft)

**Status:** DRAFT — READY FOR HUMAN REVIEW  
**Pass:** Remaining Work Execution Pass 01  
**Not legal advice.** Does not invent country-specific statutory requirements.

Use with Admin launch-readiness / provider-activation and S158 launch control plan.

Legend: **DRAFT** = template only · **EXTERNAL** = needs contracted provider · **HUMAN** = founder/legal/ops decision.

---

## A. Pharmacy onboarding
1. Collect partner application via Join portal  
2. KYC/KYB case (sandbox or EXTERNAL provider)  
3. Pharmacy licence evidence upload + admin verify  
4. Commercial approval  
5. Marketplace attestation + acceptance  
6. Location + catalog + inventory publish  
7. Test order accept → pick → pack → ready  
**Status:** DRAFT  

## B. Vendor fulfillment SOP
1. Monitor ALLOCATED queue  
2. Accept / reject with reason  
3. Pick → pack → ready  
4. Track shipment (sandbox mock / EXTERNAL carrier)  
5. Exception: ON_HOLD, cancel, return  
**Status:** DRAFT  

## C. Returns / refunds
1. Customer request via orders UI  
2. Vendor/admin review  
3. Refund via PSP sandbox / EXTERNAL live rail  
4. Inventory restock if applicable  
5. Settlement adjustment  
**Status:** DRAFT  

## D. Customer support
1. Ticket intake (customer / affiliate inbox)  
2. SLA triage  
3. Escalation to clinical / finance / ops  
4. Close with audit note (no PHI in public tickets)  
**Status:** DRAFT  

## E. Payment reconciliation
1. Daily PSP report vs ledger  
2. Investigate mismatches  
3. Chargeback desk handoff  
**Status:** DRAFT · live PSP **EXTERNAL**  

## F. Settlement reconciliation
1. Vendor payable statements  
2. Affiliate statement vs liability  
3. Period close  
**Status:** DRAFT  

## G. KYC/KYB verification
1. Document intake  
2. Review / EXTERNAL vendor result  
3. Partner approval ≠ document verified alone  
4. SoD on production enable  
**Status:** DRAFT · provider **EXTERNAL**  

## H. Incident response
1. Detect via APM/alerts (EXTERNAL destination)  
2. Severity + page on-call  
3. Contain / communicate  
4. Postmortem  
**Status:** DRAFT  

## I. Production deployment
1. Secrets refs verified (S142)  
2. Migrations forward-only  
3. Deploy target non-localhost (S145)  
4. Smoke + rollback plan  
**Status:** DRAFT · target **EXTERNAL**  

## J. Backup restore
1. Managed backup/PITR enabled (S147)  
2. Periodic restore drill  
3. Record RPO/RTO evidence  
**Status:** DRAFT · **EXTERNAL** until proven  

## K. Security incident
1. WAF/log signals  
2. Credential rotation via vault  
3. Legal notification if required (**HUMAN**)  
**Status:** DRAFT  

## L. Order cancellation
1. Customer/vendor/admin path  
2. Payment void/refund rules  
3. Inventory release  
**Status:** DRAFT  

## M. Prescription-controlled fulfillment
1. Rx-required SKU gate (S156)  
2. Pharmacy review → DISPENSED  
3. Commerce attach ELIGIBLE only  
4. No forged case UUID  
**Status:** DRAFT (software READY)  

## N. Lab partner onboarding
1. Partner application + KYC  
2. Test catalogue / packages  
3. Booking + report path  
4. HL7/FHIR only if contracted (**EXTERNAL**)  
**Status:** DRAFT  

## O. Doctor onboarding
1. Credentials + partner verify  
2. Schedule / appointments  
3. Consult + Rx; eRx transmission **EXTERNAL**  
**Status:** DRAFT  

## P. Imaging partner onboarding
1. Centre + modality catalogue  
2. Booking + report  
3. Sandbox viewer; live PACS **EXTERNAL**  
**Status:** DRAFT  

## Q. Carrier onboarding
1. Select non-mock adapter  
2. Credentials via secrets manager  
3. Webhooks + serviceability zones  
4. POD policy  
**Status:** DRAFT · **EXTERNAL**  

---

**Owner:** Ops + engineering + legal (HUMAN for licences)  
**Next:** Fill market-specific annex after OD-COUNTRY-01.
