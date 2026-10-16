// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

import type { Generated } from "kysely";

import type { BasisPoints, LocalDate, LocalTime, Minutes, Money, Qty } from "@/lib/units";

/**
 * Storage shapes: literally what SQLite holds. An instant is an ISO-8601 UTC
 * string, a boolean is 0 or 1, a calendar date and a clock time are branded
 * strings, and money, minutes, quantities and rates are branded whole numbers
 * (see src/lib/units).
 *
 * `Generated<>` marks the few columns the database gives a default. The
 * columns id, createdAt and updatedAt have none: the writer always supplies
 * them.
 */

export interface BranchTable {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  isDefault: Generated<number>;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface RoleTable {
  id: string;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  isSystem: Generated<number>;
  isActive: Generated<number>;
  sortOrder: Generated<number>;
  createdAt: string;
  updatedAt: string;
}

export interface RoleGrantTable {
  id: string;
  roleId: string;
  kind: string;
  key: string;
  access: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserTable {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  recoveryHash: string | null;
  roleId: string;
  staffMemberId: string | null;
  branchId: string | null;
  isActive: Generated<number>;
  mustChangePassword: Generated<number>;
  failedSignInCount: Generated<number>;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface SettingTable {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface SequenceTable {
  id: string;
  key: string;
  year: number;
  lastValue: Generated<number>;
  lastDate: LocalDate | null;
  updatedAt: string;
}

export interface SequenceGapTable {
  id: string;
  key: string;
  year: number;
  kind: string;
  fromValue: number;
  toValue: number;
  reason: string;
  auditLogId: string | null;
  createdAt: string;
  createdByUserId: string | null;
}

export interface ChainHeadTable {
  id: string;
  lastSeq: Generated<number>;
  lastHash: string;
  updatedAt: string;
}

export interface AuditLogTable {
  id: string;
  chainSeq: number;
  occurredAt: string;
  localDate: LocalDate;
  localTime: LocalTime;
  operation: string;
  action: string;
  userId: string | null;
  userName: string;
  userRole: string | null;
  approvedByUserId: string | null;
  reason: string;
  ownerCode: string;
  entity: string | null;
  entityId: string | null;
  entityLabel: string | null;
  subjectKind: string | null;
  subjectId: string | null;
  subjectLabel: string | null;
  disclosure: string | null;
  recipient: string | null;
  changes: string | null;
  context: string | null;
  hashV: number;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface UploadTable {
  id: string;
  url: string;
  entity: string;
  field: string;
  ownerId: string | null;
  kind: string | null;
  caption: string | null;
  takenByEmployeeId: string | null;
  sortOrder: Generated<number>;
  restrictedCapability: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  createdByUserId: string | null;
  removedAt: string | null;
  removedByUserId: string | null;
  purgedAt: string | null;
}

export interface CommuneTable {
  id: string;
  wilayaCode: string;
  nameAr: string;
  nameFr: string | null;
  nameKey: string;
  zoneId: string | null;
  isSeeded: Generated<number>;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ZoneTable {
  id: string;
  name: string;
  isActive: Generated<number>;
  note: string | null;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface BackupRunTable {
  id: string;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  targetPath: string;
  ok: Generated<number>;
  error: string | null;
  sizeBytes: number | null;
  heads: string | null;
  lastInvoiceNumber: string | null;
  lastInvoiceDate: LocalDate | null;
  isProtected: Generated<number>;
  preRestorePath: string | null;
  userId: string | null;
}

export interface StaffMemberTable {
  id: string;
  kind: string;
  numberSeq: number;
  numberSuffix: Generated<string>;
  number: string;
  registrationDate: LocalDate;
  lastName: string;
  firstName: string;
  fullNameLatin: string | null;
  sex: string;
  birthDate: LocalDate | null;
  birthDatePresumed: Generated<number>;
  birthPlace: string | null;
  birthWilayaCode: string | null;
  address: string | null;
  residenceCommuneId: string | null;
  maritalStatus: string | null;
  phone: string;
  phone2: string | null;
  email: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyAddress: string | null;
  emergencyPhone: string | null;
  educationLevel: string | null;
  certificateName: string | null;
  workedInFieldBefore: number | null;
  previousEmployer: string | null;
  abilities: string | null;
  availableDays: string | null;
  pledgeSignedDate: LocalDate | null;
  regulationsAckDate: LocalDate | null;
  regulationsVersion: string | null;
  issuedPlace: string | null;
  issuedDate: LocalDate | null;
  issuedByEmployeeId: string | null;
  nationalIdNumber: string | null;
  nameKey: string;
  nameLatinKey: string | null;
  phoneKeys: string;
  photoUrl: string | null;
  engagementStatus: string;
  leftDate: LocalDate | null;
  leftReason: string | null;
  branchId: string;
  note: string | null;
  zoneId: string | null;
  role: string | null;
  isReserve: Generated<number>;
  skillCodes: string | null;
  criminalRecordRequired: Generated<number>;
  canCollectCash: Generated<number>;
  collectAuthFrom: LocalDate | null;
  collectAuthNote: string | null;
  trainingCompletedDate: LocalDate | null;
  jobPosition: string | null;
  cvUrl: string | null;
  employmentContract: string | null;
  workTimeKind: string | null;
  startDate: LocalDate | null;
  contractEndDate: LocalDate | null;
  weeklyCapacityMin: Generated<Minutes>;
  payBasis: string | null;
  payRate: Money | null;
  payPeriod: string | null;
  cnasDeclared: Generated<number>;
  cnasNumber: string | null;
  wageMethod: string | null;
  ccpNumber: string | null;
  bankRib: string | null;
  leaveOpeningDays: Qty | null;
  leaveOpeningDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: string | null;
  deletedAt: string | null;
}

export interface StaffConfidentialTable {
  id: string;
  staffId: string;
  conditions: string | null;
  otherText: string | null;
  scoreAppearance: number | null;
  scorePersonalHygiene: number | null;
  scoreCommunication: number | null;
  scoreDiscipline: number | null;
  scoreExperience: number | null;
  scoreQuickUnderstanding: number | null;
  scorePhysicalFitness: number | null;
  scoreWorkPressure: number | null;
  scorePunctuality: number | null;
  scoreTrustHonesty: number | null;
  total: number | null;
  evaluatedByUserId: string | null;
  evaluatedDate: LocalDate | null;
  evaluationNote: string | null;
  signedFormScanUrl: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface StaffEventTable {
  id: string;
  staffId: string;
  kind: string;
  date: LocalDate;
  fromStatus: string | null;
  toStatus: string | null;
  payBasis: string | null;
  payRate: Money | null;
  payPeriod: string | null;
  weeklyCapacityMin: Minutes | null;
  reason: string | null;
  createdAt: string;
  createdByUserId: string | null;
}

export interface HiringInterviewTable {
  id: string;
  staffId: string;
  scheduledDate: LocalDate;
  scheduledTime: LocalTime | null;
  interviewerEmployeeId: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface HiringDecisionTable {
  id: string;
  staffId: string;
  decision: string;
  decisionDate: LocalDate;
  decidedByUserId: string;
  trialEndDate: LocalDate | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDocumentTable {
  id: string;
  staffId: string;
  type: string;
  version: string | null;
  isCurrent: Generated<number>;
  isRestricted: Generated<number>;
  delivered: Generated<number>;
  deliveredDate: LocalDate | null;
  issueDate: LocalDate | null;
  expiryDate: LocalDate | null;
  fileUrl: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface TrainingModuleTable {
  id: string;
  code: string;
  sortOrder: Generated<number>;
  titleAr: string;
  titleFr: string | null;
  titleEn: string | null;
  isRequired: Generated<number>;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingSessionTable {
  id: string;
  date: LocalDate;
  moduleId: string;
  trainerEmployeeId: string | null;
  place: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface TrainingAttendanceTable {
  id: string;
  sessionId: string;
  staffId: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillTable {
  id: string;
  code: string;
  labelAr: string;
  labelFr: string | null;
  labelEn: string | null;
  sortOrder: Generated<number>;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  staffId: string;
  date: LocalDate;
  article: string | null;
  article14Item: string | null;
  severity: string;
  description: string;
  reportedByEmployeeId: string | null;
  sourceKind: string;
  complaintId: string | null;
  inspectionId: string | null;
  visitId: string | null;
  problemReportId: string | null;
  staffStatement: string | null;
  action: string | null;
  status: string;
  actionDate: LocalDate | null;
  decidedByUserId: string | null;
  cancelReason: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface SanctionTable {
  id: string;
  subjectKind: string;
  staffId: string | null;
  clientId: string | null;
  state: string;
  reason: string;
  startDate: LocalDate;
  endDate: LocalDate | null;
  violationId: string | null;
  setByUserId: string;
  setAt: string;
  liftedAt: string | null;
  liftedByUserId: string | null;
  liftReason: string | null;
  displayName: string;
  displayNumber: string | null;
  nameKey: string | null;
  nameLatinKey: string | null;
  birthDate: LocalDate | null;
  phoneKeys: string | null;
  nationalIdNumber: string | null;
  extraKeys: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SanctionDecisionTable {
  id: string;
  context: string;
  attemptKind: string;
  attemptIdentity: string;
  attemptStaffId: string | null;
  attemptClientId: string | null;
  sanctionId: string;
  matchBasis: string;
  requestedByUserId: string;
  requestedAt: string;
  status: string;
  answeredByUserId: string | null;
  answeredAt: string | null;
  answerReason: string | null;
  draftPayload: string | null;
  resumeRoute: string | null;
  consumedAt: string | null;
  consumedEntityKind: string | null;
  consumedEntityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SanctionDecisionMatchTable {
  id: string;
  decisionId: string;
  sanctionId: string;
  matchBasis: string;
  createdAt: string;
}

export interface PeriodicEvaluationTable {
  id: string;
  staffId: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  evaluatorEmployeeId: string | null;
  scoreDiscipline: number;
  scoreAttendance: number;
  scoreCleaningQuality: number;
  scoreClientRespect: number;
  scoreEquipmentCare: number;
  scoreSafety: number;
  scoreProgramme: number;
  scaleMax: number;
  total: number;
  comment: string | null;
  recommendation: string | null;
  figuresSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface EmployeeLeaveTable {
  id: string;
  staffId: string;
  type: string;
  startDate: LocalDate;
  endDate: LocalDate;
  days: Qty;
  splitGroupId: string | null;
  paid: Generated<number>;
  status: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  reason: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface EmployeeCheckRecordTable {
  id: string;
  staffId: string;
  type: string;
  timestamp: string;
  localDate: LocalDate;
  localTime: LocalTime;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface EmployeeAbsenceTable {
  id: string;
  staffId: string;
  date: LocalDate;
  type: string;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  absenceMin: Minutes;
  justified: Generated<number>;
  paid: Generated<number>;
  reason: string | null;
  details: string | null;
  employeeLeaveId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface HoursAdjustmentTable {
  id: string;
  staffId: string;
  date: LocalDate;
  adjustMin: Minutes;
  kind: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface StaffPayItemTable {
  id: string;
  staffId: string;
  type: string;
  label: string;
  amount: Money;
  contributable: Generated<number>;
  taxable: Generated<number>;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface PayRunTable {
  id: string;
  numberSeq: number | null;
  numberYear: number | null;
  number: string | null;
  staffKind: string;
  periodType: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  status: string;
  ratesSnapshot: string;
  closedByUserId: string | null;
  closedAt: string | null;
  voidedByUserId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  note: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PayslipTable {
  id: string;
  payRunId: string;
  staffId: string;
  numberSeq: number | null;
  numberYear: number | null;
  number: string | null;
  staffName: string;
  staffNumber: string;
  positionOrRole: string | null;
  cnasNumber: string | null;
  payBasis: string;
  payRate: Money;
  daysWorked: Generated<Qty>;
  visitsDone: Generated<number>;
  ordersNotTypedCount: Generated<number>;
  normalMin: Generated<Minutes>;
  overtimeMin: Generated<Minutes>;
  restDayMin: Generated<Minutes>;
  absenceMin: Generated<Minutes>;
  lateMin: Generated<Minutes>;
  divisionMin: string | null;
  baseAmount: Generated<Money>;
  overtimeAmount: Generated<Money>;
  allowancesTotal: Generated<Money>;
  grossAmount: Generated<Money>;
  contributableBase: Generated<Money>;
  cnasRate: Generated<BasisPoints>;
  cnasAmount: Generated<Money>;
  taxableBase: Generated<Money>;
  irgAmount: Generated<Money>;
  advanceRepayment: Generated<Money>;
  otherDeductions: Generated<Money>;
  netAmount: Generated<Money>;
  employerCnasRate: Generated<BasisPoints>;
  employerCnasAmount: Generated<Money>;
  leaveAccruedDays: Generated<Qty>;
  leaveTakenDays: Generated<Qty>;
  leaveBalanceDays: Generated<Qty>;
  manualOverrides: string | null;
  paidAmount: Generated<Money>;
  paidDate: LocalDate | null;
  wageMethod: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PayslipItemTable {
  id: string;
  payslipId: string;
  sortOrder: number;
  type: string;
  label: string;
  quantity: Qty | null;
  rate: Money | null;
  amount: Money;
  contributable: Generated<number>;
  taxable: Generated<number>;
  sourceKind: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipSeatTable {
  id: string;
  payslipId: string;
  visitWorkerId: string;
  visitDate: LocalDate;
  countedMin: Minutes;
  isArrears: Generated<number>;
  createdAt: string;
}

export interface StaffPayoutTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  staffId: string;
  date: LocalDate;
  amount: Money;
  kind: string;
  wageMethod: string;
  payslipId: string | null;
  note: string | null;
  branchId: string;
  voidedAt: string | null;
  voidedByUserId: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface StaffDebtEntryTable {
  id: string;
  staffId: string;
  seq: number;
  date: LocalDate;
  direction: string;
  reason: string;
  amount: Money;
  balanceAfter: Money;
  note: string | null;
  payoutId: string | null;
  payslipId: string | null;
  violationId: string | null;
  handOutReturnId: string | null;
  reversesEntryId: string | null;
  createdAt: string;
  createdByUserId: string | null;
}

export interface ClientTable {
  id: string;
  numberSeq: number | null;
  number: string;
  clientType: string;
  name: string;
  nameKey: string;
  managerName: string | null;
  managerNameKey: string | null;
  capacity: string | null;
  contractingParty: string | null;
  contractingPartyOther: string | null;
  sector: string | null;
  hasTradeRegister: number | null;
  phone1: string;
  phone2: string | null;
  phoneKeys: string;
  email: string | null;
  legalForm: string | null;
  rcNumber: string | null;
  nis: string | null;
  nif: string | null;
  articleNumber: string | null;
  billingName: string | null;
  billingAddress: string | null;
  note: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: string | null;
  deletedAt: string | null;
}

export interface ContactTable {
  id: string;
  clientId: string;
  siteId: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  phone2: string | null;
  signsHandover: Generated<number>;
  receivesInvoice: Generated<number>;
  isCoordinator: Generated<number>;
  holdsKey: Generated<number>;
  followsService: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: string | null;
  deletedAt: string | null;
}

export interface SiteTable {
  id: string;
  clientId: string;
  division: string;
  siteNumber: string | null;
  commonName: string | null;
  commonNameKey: string | null;
  address: string;
  communeId: string;
  propertyType: string | null;
  propertyTypeOther: string | null;
  ownership: string | null;
  zoneId: string | null;
  district: string | null;
  landmark: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  mapLink: string | null;
  floorAndDoor: string | null;
  buildingsCount: number | null;
  keysHeld: Generated<number>;
  keyCount: number | null;
  keyReceivedDate: LocalDate | null;
  keyHolderName: string | null;
  allowedDays: string | null;
  allowedFrom: LocalTime | null;
  allowedTo: LocalTime | null;
  forbiddenCodes: string | null;
  forbiddenAreas: string | null;
  doNotTouch: string | null;
  valuables: string | null;
  instructionCodes: string | null;
  specialInstructions: string | null;
  securityInstructionsText: string | null;
  ppeCodes: string | null;
  meetingPoint: string | null;
  receiverName: string | null;
  receiverRole: string | null;
  receiverPhone: string | null;
  sameWorkerRule: Generated<number>;
  womenOnly: Generated<number>;
  requiredAbilityCodes: string | null;
  photoConsent: Generated<number>;
  isActive: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface ResidentTable {
  id: string;
  siteId: string;
  number: number;
  name: string;
  phone: string | null;
  registeredDate: LocalDate | null;
  apartment: string | null;
  building: string | null;
  leftDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: string | null;
  deletedAt: string | null;
}

export interface FileTable {
  id: string;
  formKind: string;
  numberSeq: number;
  numberSuffix: Generated<string>;
  number: string;
  registrationDate: LocalDate;
  division: string;
  serviceType: string;
  clientId: string;
  siteId: string;
  branchId: string;
  isReturning: Generated<number>;
  stage: string;
  stageChangedAt: string;
  copiedFromFileId: string | null;
  renewalOfFileId: string | null;
  sanctionDecisionId: string | null;
  lockedAt: string | null;
  partySnapshot: string | null;
  source: string | null;
  sourceRepVisitId: string | null;
  sourceVisitId: string | null;
  priority: string | null;
  assignedEmployeeId: string | null;
  officeNotes: string | null;
  firstVisitDate: LocalDate | null;
  cleanliness: string | null;
  cleanlinessNote: string | null;
  equipmentStorage: number | null;
  storagePlace: string | null;
  wasteDisposal: string | null;
  wasteDisposalOther: string | null;
  contractKind: string | null;
  contractKindNote: string | null;
  contractDuration: string | null;
  contractDurationNote: string | null;
  visitsPerWeek: number | null;
  paymentFrequency: string | null;
  requestKinds: string | null;
  requestKindNote: string | null;
  executionDurationValue: Qty | null;
  executionDurationUnit: string | null;
  executionDays: string | null;
  period: string | null;
  periodFrom: LocalTime | null;
  periodTo: LocalTime | null;
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  arrivalTime: LocalTime | null;
  departureTime: LocalTime | null;
  workersCount: number | null;
  payerName: string | null;
  payerPhone: string | null;
  materialsBearer: string | null;
  materialsAmount: Money | null;
  transportBearer: string | null;
  transportAmount: Money | null;
  paymentMethods: string | null;
  totalAmount: Money | null;
  firstDueDate: LocalDate | null;
  paymentPlace: string | null;
  teamAccess: string | null;
  hasGuard: number | null;
  securityInstructions: number | null;
  guardName: string | null;
  guardPhone: string | null;
  issuedDate: LocalDate | null;
  amountBasis: string | null;
  expensesIncluded: Generated<number>;
  amountIncludesVat: number | null;
  signedScanUrl: string | null;
  clauses: string | null;
  contractedAt: string | null;
  renewalDecision: string | null;
  renewalNote: string | null;
  endedDate: LocalDate | null;
  endKind: string | null;
  endNote: string | null;
  closedAt: string | null;
  closeReason: string | null;
  closeNote: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface FileDescriptionTable {
  id: string;
  fileId: string;
  family: string;
  buildArea: Qty | null;
  floors: number | null;
  kitchens: number | null;
  windows: number | null;
  floorType: string | null;
  entrances: number | null;
  rooms: number | null;
  majlis: number | null;
  salons: number | null;
  bathrooms: number | null;
  balconies: number | null;
  gardenArea: Qty | null;
  courtyardArea: Qty | null;
  buildings: number | null;
  offices: number | null;
  halls: number | null;
  stores: number | null;
  toilets: number | null;
  doors: number | null;
  floorArea: Qty | null;
  carParks: number | null;
  exits: number | null;
  extraLabel: string | null;
  extraValue: string | null;
  occupiedApartments: number | null;
  unoccupiedApartments: number | null;
  approxResidents: number | null;
  totalApartments: number | null;
  residentTurnover: string | null;
  stairs: number | null;
  apartments: number | null;
  corridors: number | null;
  lifts: number | null;
  hasBasements: number | null;
  hasGreenSpaces: number | null;
  hasGarages: number | null;
  hasSharedRoofs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileServiceTable {
  id: string;
  fileId: string;
  list: string;
  code: string | null;
  customLabel: string | null;
  blankSlot: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileStageEventTable {
  id: string;
  fileId: string;
  fromStage: string | null;
  toStage: string;
  changedAt: string;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface FirstVisitTable {
  id: string;
  fileId: string;
  plannedDate: LocalDate | null;
  plannedTime: LocalTime | null;
  doneDate: LocalDate | null;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  inspectorEmployeeId: string | null;
  clientRepresentative: string | null;
  firstResult: string | null;
  conditionFactors: string | null;
  spaces: string | null;
  estimatedWorkers: number | null;
  perVisitMin: Minutes | null;
  daysNeeded: Qty | null;
  weeklyMin: Minutes | null;
  monthlyMin: Minutes | null;
  distanceKm: Qty | null;
  travelMin: Minutes | null;
  transportMeans: string | null;
  accessDifficulty: string | null;
  materialsAndEquipmentNeeds: string | null;
  excludedServices: string | null;
  recommendation: string | null;
  recommendationReason: string | null;
  note: string | null;
  needsSecondVisit: Generated<number>;
  sheetScanUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface CostStudyTable {
  id: string;
  fileId: string;
  workers: number | null;
  perVisitMin: Minutes | null;
  visitsPerWeek: number | null;
  weeks: Qty | null;
  hourlyRate: Money | null;
  lines: string | null;
  totalCost: Money | null;
  marginPercent: BasisPoints | null;
  profitValue: Money | null;
  priceBeforeDiscount: Money | null;
  discount: Money | null;
  finalPrice: Money | null;
  pricePerVisit: Money | null;
  pricePerWeek: Money | null;
  pricePerMonth: Money | null;
  preparedByUserId: string | null;
  preparedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface QuoteTable {
  id: string;
  fileId: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  version: Generated<number>;
  date: LocalDate;
  validUntil: LocalDate | null;
  includedText: string | null;
  excludedText: string | null;
  materialsIncluded: number | null;
  equipmentIncluded: number | null;
  workers: number | null;
  duration: string | null;
  visits: string | null;
  subtotal: Generated<Money>;
  discount: Generated<Money>;
  total: Generated<Money>;
  amountBasis: string | null;
  taxMode: string | null;
  vatRate: BasisPoints | null;
  pricesIncludeVat: number | null;
  costTotal: Money | null;
  marginBp: BasisPoints | null;
  status: string;
  preparedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  issuedAt: string | null;
  issuedDate: LocalDate | null;
  result: Generated<string>;
  resultDate: LocalDate | null;
  resultNote: string | null;
  postponedUntil: LocalDate | null;
  signedScanUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface QuoteLineTable {
  id: string;
  quoteId: string;
  sortOrder: number;
  kind: string;
  label: string;
  description: string | null;
  quantity: Qty;
  unit: string | null;
  unitPrice: Money;
  amount: Money;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteFollowUpTable {
  id: string;
  quoteId: string;
  date: LocalDate;
  note: string | null;
  nextFollowUpDate: LocalDate | null;
  createdAt: string;
  createdByUserId: string | null;
}

export interface ClauseTemplateTable {
  id: string;
  division: string;
  serviceType: string;
  sortOrder: number;
  title: string;
  body: string;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface RepVisitTable {
  id: string;
  date: LocalDate;
  repEmployeeId: string;
  prospectName: string;
  prospectKind: string;
  activity: string | null;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  address: string | null;
  communeId: string | null;
  leftProfile: Generated<number>;
  interest: string | null;
  outcome: string | null;
  callBackDate: LocalDate | null;
  callBackDoneAt: string | null;
  note: string | null;
  clientId: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface FileAreaTable {
  id: string;
  fileId: string;
  kind: string;
  parentAreaId: string | null;
  label: string;
  catalogCode: string | null;
  sortOrder: number;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface FileTaskTable {
  id: string;
  fileId: string;
  areaId: string | null;
  frequency: string;
  catalogCode: string | null;
  serviceCode: string | null;
  label: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  specialDate: LocalDate | null;
  priority: number | null;
  sortOrder: number;
  isActive: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface FileProgrammeTable {
  id: string;
  fileId: string;
  rotateRestDay: Generated<number>;
  reminderMode: string | null;
  formChangedAt: string | null;
  inspectionFrequency: Generated<string>;
  inspectionDayOfWeek: number | null;
  inspectionSupervisorEmployeeId: string | null;
  inspectionStartDate: LocalDate | null;
  inspectionIsActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface FileSlotTable {
  id: string;
  fileId: string;
  dayOfWeek: number;
  startTime: LocalTime;
  durationMin: Minutes;
  workersNeeded: number;
  validFrom: LocalDate | null;
  validTo: LocalDate | null;
  isActive: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface FileAssignmentTable {
  id: string;
  fileId: string;
  fileSlotId: string | null;
  workerId: string | null;
  teamId: string | null;
  role: string;
  validFrom: LocalDate;
  validTo: LocalDate | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface VisitTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  fileId: string;
  fileSlotId: string | null;
  origin: string;
  sourceVisitId: string | null;
  slotDate: LocalDate | null;
  visitDate: LocalDate;
  plannedStartTime: LocalTime;
  plannedDurationMin: Minutes;
  workersNeeded: number;
  zoneId: string | null;
  supervisorEmployeeId: string | null;
  teamId: string | null;
  vehicleId: string | null;
  transportMode: string | null;
  dayOrder: number | null;
  isManuallyEdited: Generated<number>;
  status: string;
  statusChangedAt: string;
  statusChangedByUserId: string | null;
  statusReason: string | null;
  statusNote: string | null;
  rescheduledToVisitId: string | null;
  billable: Generated<number>;
  clientAtFault: number | null;
  orderPrintedAt: string | null;
  orderPrintedByUserId: string | null;
  orderPrintCount: Generated<number>;
  checklistFrozenAt: string | null;
  planChangedAt: string | null;
  orderReleasedAt: string | null;
  orderReleasedByUserId: string | null;
  arrivalReportedAt: string | null;
  arrivalReportedVia: string | null;
  arrivalReportedByUserId: string | null;
  clientInformedAt: string | null;
  actionTaken: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitWorkerTable {
  id: string;
  visitId: string;
  workerId: string;
  role: string;
  seatStatus: string;
  dayOrder: number | null;
  replacesVisitWorkerId: string | null;
  replacementReason: string | null;
  absenceId: string | null;
  replacedAt: string | null;
  replacedByUserId: string | null;
  arrivedTime: LocalTime | null;
  workStartTime: LocalTime | null;
  workEndTime: LocalTime | null;
  leftTime: LocalTime | null;
  presenceProof: string | null;
  lateMin: Minutes | null;
  lateReason: string | null;
  workedMin: Minutes | null;
  attendanceSource: string | null;
  enteredAt: string | null;
  enteredByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitChecklistItemTable {
  id: string;
  visitId: string;
  kind: string;
  fileTaskId: string | null;
  areaId: string | null;
  groupLabel: string | null;
  label: string;
  frequency: string | null;
  priority: number | null;
  carriedFromItemId: string | null;
  sortOrder: number;
  done: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitReportTable {
  id: string;
  visitId: string;
  entryState: string;
  returnedDate: LocalDate | null;
  enteredAt: string;
  enteredByUserId: string | null;
  orderScanUrl: string | null;
  presenceProof: string | null;
  completion: string | null;
  completionPercent: number | null;
  incompleteReason: string | null;
  needsExtraVisit: number | null;
  needsSupervisor: number | null;
  workerNotes: string | null;
  problemOnSite: number | null;
  supervisorNotes: string | null;
  signoffStatus: string | null;
  signoffAbsentReason: string | null;
  signoffName: string | null;
  signoffRole: string | null;
  signoffDate: LocalDate | null;
  signoffNotes: string | null;
  signedOnPaper: number | null;
  workerSigned: number | null;
  signoffScanUrl: string | null;
  wantsOtherService: number | null;
  otherServiceText: string | null;
  ratingQuality: number | null;
  ratingPunctuality: number | null;
  ratingBehaviour: number | null;
  ratingMaterials: number | null;
  ratingOverall: number | null;
  wouldRecommend: number | null;
  wantsRepeat: number | null;
  nextServiceDate: LocalDate | null;
  nextFrequency: string | null;
  preferredWorkerId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitCallTable {
  id: string;
  visitId: string;
  purpose: string;
  calledAt: string;
  calledByUserId: string | null;
  contactName: string | null;
  phone: string | null;
  result: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemReportTable {
  id: string;
  fileId: string;
  visitId: string | null;
  reportedByWorkerId: string | null;
  reportedVia: string;
  occurredDate: LocalDate;
  occurredTime: LocalTime | null;
  loggedAt: string;
  loggedByUserId: string | null;
  kind: string;
  details: string | null;
  status: string;
  assignedToEmployeeId: string | null;
  actionTaken: string | null;
  closedAt: string | null;
  closedByUserId: string | null;
  complaintId: string | null;
  correctiveTaskId: string | null;
  handedTo: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
}

export interface WorkerAbsenceTable {
  id: string;
  workerId: string;
  startDate: LocalDate;
  endDate: LocalDate;
  type: string;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  absenceMin: Minutes;
  category: string;
  leaveType: string | null;
  days: Qty | null;
  splitGroupId: string | null;
  paid: Generated<number>;
  justified: Generated<number>;
  plannedAhead: Generated<number>;
  reportedVia: string | null;
  reason: string | null;
  details: string | null;
  documentUrl: string | null;
  status: Generated<string>;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface RuleOverrideTable {
  id: string;
  visitWorkerId: string | null;
  workerId: string;
  weekStart: LocalDate | null;
  ruleDate: LocalDate | null;
  ruleCode: string;
  valueMin: Minutes | null;
  reason: string;
  derogationRef: string | null;
  approvedByUserId: string;
  approvedAt: string;
  createdAt: string;
}

export interface TeamTable {
  id: string;
  name: string;
  zoneId: string | null;
  leaderWorkerId: string | null;
  defaultVehicleId: string | null;
  isActive: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface TeamMemberTable {
  id: string;
  teamId: string;
  workerId: string;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleTable {
  id: string;
  label: string;
  plateNumber: string;
  kind: string | null;
  seats: number | null;
  zoneId: string | null;
  status: string;
  insuranceExpiry: LocalDate | null;
  inspectionExpiry: LocalDate | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface SupervisorAssignmentTable {
  id: string;
  supervisorEmployeeId: string;
  zoneId: string | null;
  workerId: string | null;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InspectionCriterionTable {
  id: string;
  code: string;
  division: string;
  labelAr: string;
  labelFr: string | null;
  labelEn: string | null;
  weight: Generated<number>;
  sortOrder: Generated<number>;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  fileId: string;
  planPeriod: string | null;
  visitId: string | null;
  plannedDate: LocalDate;
  supervisorEmployeeId: string | null;
  status: string;
  doneDate: LocalDate | null;
  doneAtTime: LocalTime | null;
  sheetPrintedAt: string | null;
  scoreTotal: number | null;
  thresholdUsed: number | null;
  belowThreshold: number | null;
  correctionNeeded: number | null;
  overallLevel: string | null;
  recommendedAction: string | null;
  supervisorNotes: string | null;
  clientRemark: string | null;
  sheetScanUrl: string | null;
  enteredAt: string | null;
  enteredByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InspectionScoreTable {
  id: string;
  inspectionId: string;
  criterionCode: string;
  label: string;
  weight: number;
  score: number | null;
  notApplicable: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionWorkerNoteTable {
  id: string;
  inspectionId: string;
  workerId: string;
  present: Generated<number>;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveTaskTable {
  id: string;
  source: string;
  inspectionId: string | null;
  complaintId: string | null;
  problemReportId: string | null;
  visitId: string | null;
  fileId: string;
  description: string;
  action: string;
  dueDate: LocalDate;
  assignedToEmployeeId: string | null;
  workerId: string | null;
  redoVisitId: string | null;
  status: string;
  doneAt: string | null;
  doneByUserId: string | null;
  resultNote: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ComplaintTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  receivedAt: string;
  receivedByUserId: string | null;
  channel: string;
  clientId: string;
  fileId: string | null;
  visitId: string | null;
  workerId: string | null;
  complainantName: string | null;
  complainantPhone: string | null;
  kind: string;
  description: string;
  targetMin: Minutes;
  dueAt: string;
  firstResponseAt: string | null;
  firstResponseByUserId: string | null;
  responseNote: string | null;
  status: string;
  centreAtFault: string | null;
  settlement: string | null;
  settlementAmount: Money | null;
  redoVisitId: string | null;
  correctiveTaskId: string | null;
  settledAt: string | null;
  settledByUserId: string | null;
  resolutionNote: string | null;
  clientToldAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PaymentDueTable {
  id: string;
  fileId: string;
  seq: number;
  kind: string;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  visitId: string | null;
  dueDate: LocalDate;
  plannedVisits: number | null;
  expectedAmount: Money;
  invoiceId: string | null;
  amount: Money;
  paidAmount: Generated<Money>;
  draftId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface DueFollowUpTable {
  id: string;
  dueId: string;
  kind: string;
  date: LocalDate;
  note: string | null;
  promisedDate: LocalDate | null;
  createdAt: string;
  createdByUserId: string | null;
}

export interface InvoiceDraftTable {
  id: string;
  fileId: string;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  replacesInvoiceId: string | null;
  payload: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InvoiceTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  fileId: string;
  clientId: string;
  division: string;
  serviceType: string;
  branchId: string;
  issueDate: LocalDate;
  issuedAt: string;
  issuedByUserId: string;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  taxMode: string;
  vatRate: BasisPoints;
  pricesIncludeVat: number;
  grossAmount: Money;
  discountAmount: Money;
  totalHT: Money;
  vatAmount: Money;
  totalTTC: Money;
  paymentMethod: string;
  stampDuty: Money;
  netToPay: Money;
  amountWordsAr: string;
  amountWordsFr: string;
  dueDate: LocalDate;
  paymentPlace: string | null;
  sellerSnapshot: string;
  buyerSnapshot: string;
  ifuMention: string | null;
  note: string | null;
  replacesInvoiceId: string | null;
  contentDigest: string;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
  createdByUserId: string;
}

export interface InvoiceLineTable {
  id: string;
  invoiceId: string;
  seq: number;
  kind: string;
  description: string;
  quantity: Qty;
  unitLabel: string;
  unitPrice: Money;
  amount: Money;
  dueId: string | null;
  visitId: string | null;
  complaintId: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface InvoiceVisitTable {
  id: string;
  invoiceId: string;
  seq: number;
  visitId: string;
  visitDate: LocalDate;
  dayName: string;
  arrival: LocalTime | null;
  departure: LocalTime | null;
  workersCount: number;
  workedMin: Minutes | null;
  completion: string;
  signOff: string | null;
  signedBy: string | null;
  billable: number;
  remark: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface VisitBillingTable {
  id: string;
  visitId: string;
  billable: number;
  reason: string;
  amount: Money | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PaymentTable {
  id: string;
  fileId: string;
  fileNumber: string;
  clientId: string;
  clientName: string;
  division: string;
  branchId: string;
  receivedDate: LocalDate;
  method: string;
  amount: Money;
  stampDuty: Money;
  totalReceived: Money;
  reference: string | null;
  payerName: string;
  place: string | null;
  collectorKind: string;
  collectorStaffId: string | null;
  receiptId: string | null;
  amountWordsAr: string | null;
  amountWordsFr: string | null;
  receiptReason: string | null;
  proofUrl: string | null;
  note: string | null;
  hashV: number;
  enteredByUserId: string;
  enteredAt: string;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface PaymentAllocationTable {
  id: string;
  paymentId: string;
  dueId: string;
  amount: Money;
  reversesAllocationId: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
  createdByUserId: string;
}

export interface ReceiptTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  issueDate: LocalDate;
  batchId: string | null;
  collectorKind: string;
  collectorStaffId: string | null;
  fileId: string | null;
  branchId: string;
  sellerSnapshot: string;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
  createdByUserId: string;
}

export interface LegalEventTable {
  id: string;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  type: string;
  reason: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: string;
  createdByUserId: string;
}

export interface ReceiptBatchTable {
  id: string;
  date: LocalDate;
  collectorKind: string;
  collectorStaffId: string | null;
  numberYear: number;
  firstNumber: number;
  lastNumber: number;
  issuedByUserId: string;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashReconciliationTable {
  id: string;
  date: LocalDate;
  collectorKind: string;
  collectorStaffId: string | null;
  receiptsIssued: number;
  receiptsUsed: number;
  receiptsVoided: number;
  receiptsMissing: number;
  expectedCash: Money;
  countedCash: Money;
  difference: Money;
  note: string | null;
  correctsReconciliationId: string | null;
  branchId: string;
  closedByUserId: string;
  closedAt: string;
  createdAt: string;
}

export interface CashReconciliationLineTable {
  id: string;
  reconciliationId: string;
  receiptId: string;
  outcome: string;
  paymentId: string | null;
  createdAt: string;
}

export interface ExpenseTable {
  id: string;
  date: LocalDate;
  division: string;
  category: string;
  amount: Money;
  method: string | null;
  paidTo: string | null;
  spentByEmployeeId: string | null;
  spentByName: string | null;
  fileId: string | null;
  supplierId: string | null;
  vehicleId: string | null;
  recurrence: Generated<string>;
  source: Generated<string>;
  purchaseId: string | null;
  maintenanceRecordId: string | null;
  staffPayoutId: string | null;
  payRunId: string | null;
  receiptUrl: string | null;
  note: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
}

export interface ExportBatchTable {
  id: string;
  kind: string;
  periodFrom: LocalDate;
  periodTo: LocalDate;
  format: string;
  fileName: string;
  rowCount: number;
  fileHash: string;
  createdAt: string;
  createdByUserId: string;
}

export interface StockItemTable {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string | null;
  nameEn: string | null;
  kind: string;
  category: string | null;
  unit: string;
  tracking: string;
  minLevel: Qty | null;
  onHandQty: Generated<Qty>;
  avgCost: Generated<Money>;
  isActive: Generated<number>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface EquipmentUnitTable {
  id: string;
  itemId: string;
  numberSeq: number;
  number: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  purchaseDate: LocalDate | null;
  purchaseCost: Money | null;
  supplierId: string | null;
  condition: string;
  locationKind: string;
  locationWorkerId: string | null;
  locationFileId: string | null;
  locationSiteId: string | null;
  maintenanceIntervalDays: number | null;
  lastMaintenanceDate: LocalDate | null;
  nextMaintenanceDate: LocalDate | null;
  retiredAt: string | null;
  retireReason: string | null;
  photoUrl: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface StockMovementTable {
  id: string;
  itemId: string;
  unitId: string | null;
  type: string;
  qty: Qty;
  unitCost: Money;
  date: LocalDate;
  handOutLineId: string | null;
  handOutReturnId: string | null;
  purchaseLineId: string | null;
  countLineId: string | null;
  reversesMovementId: string | null;
  reason: string | null;
  branchId: string;
  createdAt: string;
  createdByUserId: string;
}

export interface InventoryCountTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  kind: string;
  status: string;
  countedByUserId: string;
  closedByUserId: string | null;
  closedAt: string | null;
  note: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InventoryCountLineTable {
  id: string;
  countId: string;
  itemId: string;
  unitId: string | null;
  systemQty: Qty;
  countedQty: Qty | null;
  difference: Qty | null;
  condition: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HandOutTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  purpose: Generated<string>;
  fileId: string | null;
  visitId: string | null;
  serviceType: string | null;
  division: string | null;
  workerId: string;
  handedByUserId: string;
  note: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface HandOutLineTable {
  id: string;
  handOutId: string;
  itemId: string;
  unitId: string | null;
  qty: Qty;
  condition: string | null;
  unitCost: Money;
  expectReturn: number;
  stayAtSite: Generated<number>;
  createdAt: string;
}

export interface HandOutReturnTable {
  id: string;
  handOutLineId: string;
  date: LocalDate;
  qtyReturned: Qty;
  condition: string | null;
  qtyLost: Generated<Qty>;
  qtyDamaged: Generated<Qty>;
  note: string | null;
  receivedByUserId: string;
  createdAt: string;
}

export interface SupplierTable {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  rc: string | null;
  nif: string | null;
  note: string | null;
  isActive: Generated<number>;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface PurchaseRequestTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  status: string;
  supplierId: string | null;
  requestedByUserId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: string | null;
}

export interface PurchaseRequestLineTable {
  id: string;
  purchaseRequestId: string;
  itemId: string;
  qty: Qty;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseTable {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  supplierId: string;
  supplierInvoiceNo: string | null;
  purchaseRequestId: string | null;
  division: Generated<string>;
  total: Money;
  method: string;
  paidAmount: Generated<Money>;
  invoiceUrl: string | null;
  receivedByUserId: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  branchId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PurchaseLineTable {
  id: string;
  purchaseId: string;
  seq: number;
  itemId: string;
  qty: Qty;
  unitPrice: Money;
  amount: Money;
  createdAt: string;
}

export interface MaintenanceRecordTable {
  id: string;
  unitId: string;
  kind: string;
  date: LocalDate;
  description: string;
  cost: Generated<Money>;
  provider: string | null;
  conditionAfter: string;
  nextDueDate: LocalDate | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface DB {
  Branch: BranchTable;
  Role: RoleTable;
  RoleGrant: RoleGrantTable;
  User: UserTable;
  Setting: SettingTable;
  Sequence: SequenceTable;
  SequenceGap: SequenceGapTable;
  ChainHead: ChainHeadTable;
  AuditLog: AuditLogTable;
  Upload: UploadTable;
  Commune: CommuneTable;
  Zone: ZoneTable;
  BackupRun: BackupRunTable;
  StaffMember: StaffMemberTable;
  StaffConfidential: StaffConfidentialTable;
  StaffEvent: StaffEventTable;
  HiringInterview: HiringInterviewTable;
  HiringDecision: HiringDecisionTable;
  StaffDocument: StaffDocumentTable;
  TrainingModule: TrainingModuleTable;
  TrainingSession: TrainingSessionTable;
  TrainingAttendance: TrainingAttendanceTable;
  Skill: SkillTable;
  Violation: ViolationTable;
  Sanction: SanctionTable;
  SanctionDecision: SanctionDecisionTable;
  SanctionDecisionMatch: SanctionDecisionMatchTable;
  PeriodicEvaluation: PeriodicEvaluationTable;
  EmployeeLeave: EmployeeLeaveTable;
  EmployeeCheckRecord: EmployeeCheckRecordTable;
  EmployeeAbsence: EmployeeAbsenceTable;
  HoursAdjustment: HoursAdjustmentTable;
  StaffPayItem: StaffPayItemTable;
  PayRun: PayRunTable;
  Payslip: PayslipTable;
  PayslipItem: PayslipItemTable;
  PayslipSeat: PayslipSeatTable;
  StaffPayout: StaffPayoutTable;
  StaffDebtEntry: StaffDebtEntryTable;
  Client: ClientTable;
  Contact: ContactTable;
  Site: SiteTable;
  Resident: ResidentTable;
  File: FileTable;
  FileDescription: FileDescriptionTable;
  FileService: FileServiceTable;
  FileStageEvent: FileStageEventTable;
  FirstVisit: FirstVisitTable;
  CostStudy: CostStudyTable;
  Quote: QuoteTable;
  QuoteLine: QuoteLineTable;
  QuoteFollowUp: QuoteFollowUpTable;
  ClauseTemplate: ClauseTemplateTable;
  RepVisit: RepVisitTable;
  FileArea: FileAreaTable;
  FileTask: FileTaskTable;
  FileProgramme: FileProgrammeTable;
  FileSlot: FileSlotTable;
  FileAssignment: FileAssignmentTable;
  Visit: VisitTable;
  VisitWorker: VisitWorkerTable;
  VisitChecklistItem: VisitChecklistItemTable;
  VisitReport: VisitReportTable;
  VisitCall: VisitCallTable;
  ProblemReport: ProblemReportTable;
  WorkerAbsence: WorkerAbsenceTable;
  RuleOverride: RuleOverrideTable;
  Team: TeamTable;
  TeamMember: TeamMemberTable;
  Vehicle: VehicleTable;
  SupervisorAssignment: SupervisorAssignmentTable;
  InspectionCriterion: InspectionCriterionTable;
  Inspection: InspectionTable;
  InspectionScore: InspectionScoreTable;
  InspectionWorkerNote: InspectionWorkerNoteTable;
  CorrectiveTask: CorrectiveTaskTable;
  Complaint: ComplaintTable;
  PaymentDue: PaymentDueTable;
  DueFollowUp: DueFollowUpTable;
  InvoiceDraft: InvoiceDraftTable;
  Invoice: InvoiceTable;
  InvoiceLine: InvoiceLineTable;
  InvoiceVisit: InvoiceVisitTable;
  VisitBilling: VisitBillingTable;
  Payment: PaymentTable;
  PaymentAllocation: PaymentAllocationTable;
  Receipt: ReceiptTable;
  LegalEvent: LegalEventTable;
  ReceiptBatch: ReceiptBatchTable;
  CashReconciliation: CashReconciliationTable;
  CashReconciliationLine: CashReconciliationLineTable;
  Expense: ExpenseTable;
  ExportBatch: ExportBatchTable;
  StockItem: StockItemTable;
  EquipmentUnit: EquipmentUnitTable;
  StockMovement: StockMovementTable;
  InventoryCount: InventoryCountTable;
  InventoryCountLine: InventoryCountLineTable;
  HandOut: HandOutTable;
  HandOutLine: HandOutLineTable;
  HandOutReturn: HandOutReturnTable;
  Supplier: SupplierTable;
  PurchaseRequest: PurchaseRequestTable;
  PurchaseRequestLine: PurchaseRequestLineTable;
  Purchase: PurchaseTable;
  PurchaseLine: PurchaseLineTable;
  MaintenanceRecord: MaintenanceRecordTable;
}
