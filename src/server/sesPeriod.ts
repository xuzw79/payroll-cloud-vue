export type PeriodMember = {
  startDate?: string | null;
  endDate?: string | null;
};

export function memberActiveInPeriod(member: PeriodMember, period: string) {
  const startPeriod = member.startDate?.slice(0, 7);
  const endPeriod = member.endDate?.slice(0, 7);
  return (!startPeriod || startPeriod <= period) && (!endPeriod || endPeriod >= period);
}

export function filterActiveMembersForPeriod<T extends PeriodMember>(members: T[], period: string) {
  return members.filter((member) => memberActiveInPeriod(member, period));
}
