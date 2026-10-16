// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

import type { BasisPoints, LocalDate, LocalTime, Minutes, Money, Qty } from "@/lib/units";

/**
 * Row shapes as the screens work with them, after hydrate() (./rows): an
 * instant is a Date, a 0/1 column is a boolean. Calendar dates and clock times
 * stay the strings they are. Named `<Table>Row` so that `File` and `Payment`
 * do not shadow other things of the same name.
 */

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface RoleRow {
  id: string;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleGrantRow {
  id: string;
  roleId: string;
  kind: string;
  key: string;
  access: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  recoveryHash: string | null;
  roleId: string;
  staffMemberId: string | null;
  branchId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  failedSignInCount: number;
  lastSignInAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface SettingRow {
  id: string;
  key: string;
  value: string;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export interface SequenceRow {
  id: string;
  key: string;
  year: number;
  lastValue: number;
  lastDate: LocalDate | null;
  updatedAt: Date;
}

export interface SequenceGapRow {
  id: string;
  key: string;
  year: number;
  kind: string;
  fromValue: number;
  toValue: number;
  reason: string;
  auditLogId: string | null;
  createdAt: Date;
  createdByUserId: string | null;
}

export interface ChainHeadRow {
  id: string;
  lastSeq: number;
  lastHash: string;
  updatedAt: Date;
}

export interface AuditLogRow {
  id: string;
  chainSeq: number;
  occurredAt: Date;
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
  createdAt: Date;
}

export interface UploadRow {
  id: string;
  url: string;
  entity: string;
  field: string;
  ownerId: string | null;
  kind: string | null;
  caption: string | null;
  takenByEmployeeId: string | null;
  sortOrder: number;
  restrictedCapability: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  createdByUserId: string | null;
  removedAt: Date | null;
  removedByUserId: string | null;
  purgedAt: Date | null;
}

export interface CommuneRow {
  id: string;
  wilayaCode: string;
  nameAr: string;
  nameFr: string | null;
  nameKey: string;
  zoneId: string | null;
  isSeeded: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ZoneRow {
  id: string;
  name: string;
  isActive: boolean;
  note: string | null;
  branchId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface BackupRunRow {
  id: string;
  kind: string;
  startedAt: Date;
  finishedAt: Date | null;
  targetPath: string;
  ok: boolean;
  error: string | null;
  sizeBytes: number | null;
  heads: string | null;
  lastInvoiceNumber: string | null;
  lastInvoiceDate: LocalDate | null;
  isProtected: boolean;
  preRestorePath: string | null;
  userId: string | null;
}

export interface StaffMemberRow {
  id: string;
  kind: string;
  numberSeq: number;
  numberSuffix: string;
  number: string;
  registrationDate: LocalDate;
  lastName: string;
  firstName: string;
  fullNameLatin: string | null;
  sex: string;
  birthDate: LocalDate | null;
  birthDatePresumed: boolean;
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
  workedInFieldBefore: boolean | null;
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
  isReserve: boolean;
  skillCodes: string | null;
  criminalRecordRequired: boolean;
  canCollectCash: boolean;
  collectAuthFrom: LocalDate | null;
  collectAuthNote: string | null;
  trainingCompletedDate: LocalDate | null;
  jobPosition: string | null;
  cvUrl: string | null;
  employmentContract: string | null;
  workTimeKind: string | null;
  startDate: LocalDate | null;
  contractEndDate: LocalDate | null;
  weeklyCapacityMin: Minutes;
  payBasis: string | null;
  payRate: Money | null;
  payPeriod: string | null;
  cnasDeclared: boolean;
  cnasNumber: string | null;
  wageMethod: string | null;
  ccpNumber: string | null;
  bankRib: string | null;
  leaveOpeningDays: Qty | null;
  leaveOpeningDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: Date | null;
  deletedAt: Date | null;
}

export interface StaffConfidentialRow {
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
  createdAt: Date;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export interface StaffEventRow {
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
  createdAt: Date;
  createdByUserId: string | null;
}

export interface HiringInterviewRow {
  id: string;
  staffId: string;
  scheduledDate: LocalDate;
  scheduledTime: LocalTime | null;
  interviewerEmployeeId: string | null;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface HiringDecisionRow {
  id: string;
  staffId: string;
  decision: string;
  decisionDate: LocalDate;
  decidedByUserId: string;
  trialEndDate: LocalDate | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffDocumentRow {
  id: string;
  staffId: string;
  type: string;
  version: string | null;
  isCurrent: boolean;
  isRestricted: boolean;
  delivered: boolean;
  deliveredDate: LocalDate | null;
  issueDate: LocalDate | null;
  expiryDate: LocalDate | null;
  fileUrl: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface TrainingModuleRow {
  id: string;
  code: string;
  sortOrder: number;
  titleAr: string;
  titleFr: string | null;
  titleEn: string | null;
  isRequired: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingSessionRow {
  id: string;
  date: LocalDate;
  moduleId: string;
  trainerEmployeeId: string | null;
  place: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface TrainingAttendanceRow {
  id: string;
  sessionId: string;
  staffId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillRow {
  id: string;
  code: string;
  labelAr: string;
  labelFr: string | null;
  labelEn: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationRow {
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
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface SanctionRow {
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
  setAt: Date;
  liftedAt: Date | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface SanctionDecisionRow {
  id: string;
  context: string;
  attemptKind: string;
  attemptIdentity: string;
  attemptStaffId: string | null;
  attemptClientId: string | null;
  sanctionId: string;
  matchBasis: string;
  requestedByUserId: string;
  requestedAt: Date;
  status: string;
  answeredByUserId: string | null;
  answeredAt: Date | null;
  answerReason: string | null;
  draftPayload: string | null;
  resumeRoute: string | null;
  consumedAt: Date | null;
  consumedEntityKind: string | null;
  consumedEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SanctionDecisionMatchRow {
  id: string;
  decisionId: string;
  sanctionId: string;
  matchBasis: string;
  createdAt: Date;
}

export interface PeriodicEvaluationRow {
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
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface EmployeeLeaveRow {
  id: string;
  staffId: string;
  type: string;
  startDate: LocalDate;
  endDate: LocalDate;
  days: Qty;
  splitGroupId: string | null;
  paid: boolean;
  status: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  reason: string | null;
  attachmentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface EmployeeCheckRecordRow {
  id: string;
  staffId: string;
  type: string;
  timestamp: Date;
  localDate: LocalDate;
  localTime: LocalTime;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface EmployeeAbsenceRow {
  id: string;
  staffId: string;
  date: LocalDate;
  type: string;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  absenceMin: Minutes;
  justified: boolean;
  paid: boolean;
  reason: string | null;
  details: string | null;
  employeeLeaveId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface HoursAdjustmentRow {
  id: string;
  staffId: string;
  date: LocalDate;
  adjustMin: Minutes;
  kind: string;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface StaffPayItemRow {
  id: string;
  staffId: string;
  type: string;
  label: string;
  amount: Money;
  contributable: boolean;
  taxable: boolean;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface PayRunRow {
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
  closedAt: Date | null;
  voidedByUserId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  note: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PayslipRow {
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
  daysWorked: Qty;
  visitsDone: number;
  ordersNotTypedCount: number;
  normalMin: Minutes;
  overtimeMin: Minutes;
  restDayMin: Minutes;
  absenceMin: Minutes;
  lateMin: Minutes;
  divisionMin: string | null;
  baseAmount: Money;
  overtimeAmount: Money;
  allowancesTotal: Money;
  grossAmount: Money;
  contributableBase: Money;
  cnasRate: BasisPoints;
  cnasAmount: Money;
  taxableBase: Money;
  irgAmount: Money;
  advanceRepayment: Money;
  otherDeductions: Money;
  netAmount: Money;
  employerCnasRate: BasisPoints;
  employerCnasAmount: Money;
  leaveAccruedDays: Qty;
  leaveTakenDays: Qty;
  leaveBalanceDays: Qty;
  manualOverrides: string | null;
  paidAmount: Money;
  paidDate: LocalDate | null;
  wageMethod: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PayslipItemRow {
  id: string;
  payslipId: string;
  sortOrder: number;
  type: string;
  label: string;
  quantity: Qty | null;
  rate: Money | null;
  amount: Money;
  contributable: boolean;
  taxable: boolean;
  sourceKind: string | null;
  sourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayslipSeatRow {
  id: string;
  payslipId: string;
  visitWorkerId: string;
  visitDate: LocalDate;
  countedMin: Minutes;
  isArrears: boolean;
  createdAt: Date;
}

export interface StaffPayoutRow {
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
  voidedAt: Date | null;
  voidedByUserId: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface StaffDebtEntryRow {
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
  createdAt: Date;
  createdByUserId: string | null;
}

export interface ClientRow {
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
  hasTradeRegister: boolean | null;
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
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: Date | null;
  deletedAt: Date | null;
}

export interface ContactRow {
  id: string;
  clientId: string;
  siteId: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  phone2: string | null;
  signsHandover: boolean;
  receivesInvoice: boolean;
  isCoordinator: boolean;
  holdsKey: boolean;
  followsService: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: Date | null;
  deletedAt: Date | null;
}

export interface SiteRow {
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
  keysHeld: boolean;
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
  sameWorkerRule: boolean;
  womenOnly: boolean;
  requiredAbilityCodes: string | null;
  photoConsent: boolean;
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface ResidentRow {
  id: string;
  siteId: string;
  number: number;
  name: string;
  phone: string | null;
  registeredDate: LocalDate | null;
  apartment: string | null;
  building: string | null;
  leftDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  anonymisedAt: Date | null;
  deletedAt: Date | null;
}

export interface FileRow {
  id: string;
  formKind: string;
  numberSeq: number;
  numberSuffix: string;
  number: string;
  registrationDate: LocalDate;
  division: string;
  serviceType: string;
  clientId: string;
  siteId: string;
  branchId: string;
  isReturning: boolean;
  stage: string;
  stageChangedAt: Date;
  copiedFromFileId: string | null;
  renewalOfFileId: string | null;
  sanctionDecisionId: string | null;
  lockedAt: Date | null;
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
  equipmentStorage: boolean | null;
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
  hasGuard: boolean | null;
  securityInstructions: boolean | null;
  guardName: string | null;
  guardPhone: string | null;
  issuedDate: LocalDate | null;
  amountBasis: string | null;
  expensesIncluded: boolean;
  amountIncludesVat: boolean | null;
  signedScanUrl: string | null;
  clauses: string | null;
  contractedAt: Date | null;
  renewalDecision: string | null;
  renewalNote: string | null;
  endedDate: LocalDate | null;
  endKind: string | null;
  endNote: string | null;
  closedAt: Date | null;
  closeReason: string | null;
  closeNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface FileDescriptionRow {
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
  hasBasements: boolean | null;
  hasGreenSpaces: boolean | null;
  hasGarages: boolean | null;
  hasSharedRoofs: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileServiceRow {
  id: string;
  fileId: string;
  list: string;
  code: string | null;
  customLabel: string | null;
  blankSlot: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileStageEventRow {
  id: string;
  fileId: string;
  fromStage: string | null;
  toStage: string;
  changedAt: Date;
  changedByUserId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface FirstVisitRow {
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
  needsSecondVisit: boolean;
  sheetScanUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface CostStudyRow {
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
  preparedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface QuoteRow {
  id: string;
  fileId: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  version: number;
  date: LocalDate;
  validUntil: LocalDate | null;
  includedText: string | null;
  excludedText: string | null;
  materialsIncluded: boolean | null;
  equipmentIncluded: boolean | null;
  workers: number | null;
  duration: string | null;
  visits: string | null;
  subtotal: Money;
  discount: Money;
  total: Money;
  amountBasis: string | null;
  taxMode: string | null;
  vatRate: BasisPoints | null;
  pricesIncludeVat: boolean | null;
  costTotal: Money | null;
  marginBp: BasisPoints | null;
  status: string;
  preparedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  approvalNote: string | null;
  issuedAt: Date | null;
  issuedDate: LocalDate | null;
  result: string;
  resultDate: LocalDate | null;
  resultNote: string | null;
  postponedUntil: LocalDate | null;
  signedScanUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface QuoteLineRow {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteFollowUpRow {
  id: string;
  quoteId: string;
  date: LocalDate;
  note: string | null;
  nextFollowUpDate: LocalDate | null;
  createdAt: Date;
  createdByUserId: string | null;
}

export interface ClauseTemplateRow {
  id: string;
  division: string;
  serviceType: string;
  sortOrder: number;
  title: string;
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface RepVisitRow {
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
  leftProfile: boolean;
  interest: string | null;
  outcome: string | null;
  callBackDate: LocalDate | null;
  callBackDoneAt: Date | null;
  note: string | null;
  clientId: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface FileAreaRow {
  id: string;
  fileId: string;
  kind: string;
  parentAreaId: string | null;
  label: string;
  catalogCode: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface FileTaskRow {
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
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface FileProgrammeRow {
  id: string;
  fileId: string;
  rotateRestDay: boolean;
  reminderMode: string | null;
  formChangedAt: Date | null;
  inspectionFrequency: string;
  inspectionDayOfWeek: number | null;
  inspectionSupervisorEmployeeId: string | null;
  inspectionStartDate: LocalDate | null;
  inspectionIsActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface FileSlotRow {
  id: string;
  fileId: string;
  dayOfWeek: number;
  startTime: LocalTime;
  durationMin: Minutes;
  workersNeeded: number;
  validFrom: LocalDate | null;
  validTo: LocalDate | null;
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface FileAssignmentRow {
  id: string;
  fileId: string;
  fileSlotId: string | null;
  workerId: string | null;
  teamId: string | null;
  role: string;
  validFrom: LocalDate;
  validTo: LocalDate | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface VisitRow {
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
  isManuallyEdited: boolean;
  status: string;
  statusChangedAt: Date;
  statusChangedByUserId: string | null;
  statusReason: string | null;
  statusNote: string | null;
  rescheduledToVisitId: string | null;
  billable: boolean;
  clientAtFault: boolean | null;
  orderPrintedAt: Date | null;
  orderPrintedByUserId: string | null;
  orderPrintCount: number;
  checklistFrozenAt: Date | null;
  planChangedAt: Date | null;
  orderReleasedAt: Date | null;
  orderReleasedByUserId: string | null;
  arrivalReportedAt: Date | null;
  arrivalReportedVia: string | null;
  arrivalReportedByUserId: string | null;
  clientInformedAt: Date | null;
  actionTaken: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitWorkerRow {
  id: string;
  visitId: string;
  workerId: string;
  role: string;
  seatStatus: string;
  dayOrder: number | null;
  replacesVisitWorkerId: string | null;
  replacementReason: string | null;
  absenceId: string | null;
  replacedAt: Date | null;
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
  enteredAt: Date | null;
  enteredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitChecklistItemRow {
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
  done: boolean | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitReportRow {
  id: string;
  visitId: string;
  entryState: string;
  returnedDate: LocalDate | null;
  enteredAt: Date;
  enteredByUserId: string | null;
  orderScanUrl: string | null;
  presenceProof: string | null;
  completion: string | null;
  completionPercent: number | null;
  incompleteReason: string | null;
  needsExtraVisit: boolean | null;
  needsSupervisor: boolean | null;
  workerNotes: string | null;
  problemOnSite: boolean | null;
  supervisorNotes: string | null;
  signoffStatus: string | null;
  signoffAbsentReason: string | null;
  signoffName: string | null;
  signoffRole: string | null;
  signoffDate: LocalDate | null;
  signoffNotes: string | null;
  signedOnPaper: boolean | null;
  workerSigned: boolean | null;
  signoffScanUrl: string | null;
  wantsOtherService: boolean | null;
  otherServiceText: string | null;
  ratingQuality: number | null;
  ratingPunctuality: number | null;
  ratingBehaviour: number | null;
  ratingMaterials: number | null;
  ratingOverall: number | null;
  wouldRecommend: boolean | null;
  wantsRepeat: boolean | null;
  nextServiceDate: LocalDate | null;
  nextFrequency: string | null;
  preferredWorkerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface VisitCallRow {
  id: string;
  visitId: string;
  purpose: string;
  calledAt: Date;
  calledByUserId: string | null;
  contactName: string | null;
  phone: string | null;
  result: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProblemReportRow {
  id: string;
  fileId: string;
  visitId: string | null;
  reportedByWorkerId: string | null;
  reportedVia: string;
  occurredDate: LocalDate;
  occurredTime: LocalTime | null;
  loggedAt: Date;
  loggedByUserId: string | null;
  kind: string;
  details: string | null;
  status: string;
  assignedToEmployeeId: string | null;
  actionTaken: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  complaintId: string | null;
  correctiveTaskId: string | null;
  handedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
}

export interface WorkerAbsenceRow {
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
  paid: boolean;
  justified: boolean;
  plannedAhead: boolean;
  reportedVia: string | null;
  reason: string | null;
  details: string | null;
  documentUrl: string | null;
  status: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface RuleOverrideRow {
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
  approvedAt: Date;
  createdAt: Date;
}

export interface TeamRow {
  id: string;
  name: string;
  zoneId: string | null;
  leaderWorkerId: string | null;
  defaultVehicleId: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface TeamMemberRow {
  id: string;
  teamId: string;
  workerId: string;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleRow {
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
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface SupervisorAssignmentRow {
  id: string;
  supervisorEmployeeId: string;
  zoneId: string | null;
  workerId: string | null;
  fromDate: LocalDate;
  toDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InspectionCriterionRow {
  id: string;
  code: string;
  division: string;
  labelAr: string;
  labelFr: string | null;
  labelEn: string | null;
  weight: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionRow {
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
  sheetPrintedAt: Date | null;
  scoreTotal: number | null;
  thresholdUsed: number | null;
  belowThreshold: boolean | null;
  correctionNeeded: boolean | null;
  overallLevel: string | null;
  recommendedAction: string | null;
  supervisorNotes: string | null;
  clientRemark: string | null;
  sheetScanUrl: string | null;
  enteredAt: Date | null;
  enteredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InspectionScoreRow {
  id: string;
  inspectionId: string;
  criterionCode: string;
  label: string;
  weight: number;
  score: number | null;
  notApplicable: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionWorkerNoteRow {
  id: string;
  inspectionId: string;
  workerId: string;
  present: boolean;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CorrectiveTaskRow {
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
  doneAt: Date | null;
  doneByUserId: string | null;
  resultNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ComplaintRow {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  receivedAt: Date;
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
  dueAt: Date;
  firstResponseAt: Date | null;
  firstResponseByUserId: string | null;
  responseNote: string | null;
  status: string;
  centreAtFault: string | null;
  settlement: string | null;
  settlementAmount: Money | null;
  redoVisitId: string | null;
  correctiveTaskId: string | null;
  settledAt: Date | null;
  settledByUserId: string | null;
  resolutionNote: string | null;
  clientToldAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PaymentDueRow {
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
  paidAmount: Money;
  draftId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface DueFollowUpRow {
  id: string;
  dueId: string;
  kind: string;
  date: LocalDate;
  note: string | null;
  promisedDate: LocalDate | null;
  createdAt: Date;
  createdByUserId: string | null;
}

export interface InvoiceDraftRow {
  id: string;
  fileId: string;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  replacesInvoiceId: string | null;
  payload: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InvoiceRow {
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
  issuedAt: Date;
  issuedByUserId: string;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  taxMode: string;
  vatRate: BasisPoints;
  pricesIncludeVat: boolean;
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
  createdAt: Date;
  createdByUserId: string;
}

export interface InvoiceLineRow {
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
  createdAt: Date;
}

export interface InvoiceVisitRow {
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
  billable: boolean;
  remark: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: Date;
}

export interface VisitBillingRow {
  id: string;
  visitId: string;
  billable: boolean;
  reason: string;
  amount: Money | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PaymentRow {
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
  enteredAt: Date;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: Date;
}

export interface PaymentAllocationRow {
  id: string;
  paymentId: string;
  dueId: string;
  amount: Money;
  reversesAllocationId: string | null;
  hashV: number;
  chainSeq: number;
  prevHash: string;
  hash: string;
  createdAt: Date;
  createdByUserId: string;
}

export interface ReceiptRow {
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
  createdAt: Date;
  createdByUserId: string;
}

export interface LegalEventRow {
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
  createdAt: Date;
  createdByUserId: string;
}

export interface ReceiptBatchRow {
  id: string;
  date: LocalDate;
  collectorKind: string;
  collectorStaffId: string | null;
  numberYear: number;
  firstNumber: number;
  lastNumber: number;
  issuedByUserId: string;
  returnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CashReconciliationRow {
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
  closedAt: Date;
  createdAt: Date;
}

export interface CashReconciliationLineRow {
  id: string;
  reconciliationId: string;
  receiptId: string;
  outcome: string;
  paymentId: string | null;
  createdAt: Date;
}

export interface ExpenseRow {
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
  recurrence: string;
  source: string;
  purchaseId: string | null;
  maintenanceRecordId: string | null;
  staffPayoutId: string | null;
  payRunId: string | null;
  receiptUrl: string | null;
  note: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
  deleteReason: string | null;
}

export interface ExportBatchRow {
  id: string;
  kind: string;
  periodFrom: LocalDate;
  periodTo: LocalDate;
  format: string;
  fileName: string;
  rowCount: number;
  fileHash: string;
  createdAt: Date;
  createdByUserId: string;
}

export interface StockItemRow {
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
  onHandQty: Qty;
  avgCost: Money;
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface EquipmentUnitRow {
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
  retiredAt: Date | null;
  retireReason: string | null;
  photoUrl: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface StockMovementRow {
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
  createdAt: Date;
  createdByUserId: string;
}

export interface InventoryCountRow {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  kind: string;
  status: string;
  countedByUserId: string;
  closedByUserId: string | null;
  closedAt: Date | null;
  note: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface InventoryCountLineRow {
  id: string;
  countId: string;
  itemId: string;
  unitId: string | null;
  systemQty: Qty;
  countedQty: Qty | null;
  difference: Qty | null;
  condition: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HandOutRow {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  purpose: string;
  fileId: string | null;
  visitId: string | null;
  serviceType: string | null;
  division: string | null;
  workerId: string;
  handedByUserId: string;
  note: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface HandOutLineRow {
  id: string;
  handOutId: string;
  itemId: string;
  unitId: string | null;
  qty: Qty;
  condition: string | null;
  unitCost: Money;
  expectReturn: boolean;
  stayAtSite: boolean;
  createdAt: Date;
}

export interface HandOutReturnRow {
  id: string;
  handOutLineId: string;
  date: LocalDate;
  qtyReturned: Qty;
  condition: string | null;
  qtyLost: Qty;
  qtyDamaged: Qty;
  note: string | null;
  receivedByUserId: string;
  createdAt: Date;
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  rc: string | null;
  nif: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface PurchaseRequestRow {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  status: string;
  supplierId: string | null;
  requestedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deletedAt: Date | null;
}

export interface PurchaseRequestLineRow {
  id: string;
  purchaseRequestId: string;
  itemId: string;
  qty: Qty;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseRow {
  id: string;
  numberSeq: number;
  numberYear: number;
  number: string;
  date: LocalDate;
  supplierId: string;
  supplierInvoiceNo: string | null;
  purchaseRequestId: string | null;
  division: string;
  total: Money;
  method: string;
  paidAmount: Money;
  invoiceUrl: string | null;
  receivedByUserId: string;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PurchaseLineRow {
  id: string;
  purchaseId: string;
  seq: number;
  itemId: string;
  qty: Qty;
  unitPrice: Money;
  amount: Money;
  createdAt: Date;
}

export interface MaintenanceRecordRow {
  id: string;
  unitId: string;
  kind: string;
  date: LocalDate;
  description: string;
  cost: Money;
  provider: string | null;
  conditionAfter: string;
  nextDueDate: LocalDate | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}
