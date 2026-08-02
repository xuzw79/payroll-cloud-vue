import { filterActiveMembersForPeriod, memberActiveInPeriod, type PeriodMember } from "./sesPeriod.js";

export type PartnerCostContract<TMember extends PeriodMember> = {
  members: TMember[];
};

export type PartnerCostRecord = {
  period: string;
  contractMember?: PeriodMember | null;
};

export function activePartnerCostRows<TContract extends PartnerCostContract<TMember>, TMember extends PeriodMember>(
  contracts: TContract[],
  period: string
) {
  return contracts.flatMap((contract) =>
    filterActiveMembersForPeriod(contract.members, period).map((member) => ({ contract, member }))
  );
}

export function filterActivePartnerCostsForOwnPeriod<TCost extends PartnerCostRecord>(costs: TCost[]) {
  return costs.filter((cost) => cost.contractMember && memberActiveInPeriod(cost.contractMember, cost.period));
}

export function partnerCostDefaultAmount(unitPrice: number, taxIncluded?: boolean | null, taxRate = 0.1) {
  const amount = Number(unitPrice || 0);
  return taxIncluded ? amount : Math.round(amount * (1 + taxRate));
}
