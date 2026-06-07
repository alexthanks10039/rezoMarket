const leads = new Map();

export const LEAD_STATUSES = {
  NEW: 'new',
  IN_WORK: 'in_work',
  REASSIGNED: 'reassigned',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

export const statusLabels = {
  [LEAD_STATUSES.NEW]: 'Новая',
  [LEAD_STATUSES.IN_WORK]: 'В работе',
  [LEAD_STATUSES.REASSIGNED]: 'Переназначена',
  [LEAD_STATUSES.DONE]: 'Выполнена',
  [LEAD_STATUSES.CANCELLED]: 'Отменена',
};

export const createLeadRecord = (lead) => {
  const record = {
    ...lead,
    status: lead.status || LEAD_STATUSES.NEW,
    assignedTo: lead.assignedTo || null,
    history: [
      {
        action: 'created',
        at: lead.createdAt || new Date().toISOString(),
        by: 'website',
      },
    ],
  };

  leads.set(record.id, record);
  return record;
};

export const getLeadById = (leadId) => leads.get(leadId) || null;

export const getAllLeads = () => [...leads.values()].sort((a, b) => {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
});

export const getLeadsByStatus = (status) => getAllLeads().filter((lead) => lead.status === status);

export const updateLeadStatus = ({ leadId, status, by = 'bot' }) => {
  const lead = getLeadById(leadId);
  if (!lead) return null;

  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  lead.history.push({
    action: `status:${status}`,
    at: lead.updatedAt,
    by,
  });

  leads.set(lead.id, lead);
  return lead;
};

export const reassignLead = ({ leadId, employeeId, employeeName, by = 'bot' }) => {
  const lead = getLeadById(leadId);
  if (!lead) return null;

  lead.status = LEAD_STATUSES.REASSIGNED;
  lead.assignedTo = {
    id: employeeId,
    name: employeeName,
  };
  lead.updatedAt = new Date().toISOString();
  lead.history.push({
    action: `reassigned:${employeeName}`,
    at: lead.updatedAt,
    by,
  });

  leads.set(lead.id, lead);
  return lead;
};

export const getLeadStats = () => {
  const all = getAllLeads();

  return {
    total: all.length,
    new: all.filter((lead) => lead.status === LEAD_STATUSES.NEW).length,
    inWork: all.filter((lead) => lead.status === LEAD_STATUSES.IN_WORK).length,
    done: all.filter((lead) => lead.status === LEAD_STATUSES.DONE).length,
    reassigned: all.filter((lead) => lead.status === LEAD_STATUSES.REASSIGNED).length,
    cancelled: all.filter((lead) => lead.status === LEAD_STATUSES.CANCELLED).length,
  };
};
