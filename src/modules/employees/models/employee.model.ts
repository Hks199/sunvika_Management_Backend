import { Schema, model, type InferSchemaType } from 'mongoose';

const employeeSchema = new Schema({
  employeeCode: { type: String, required: true, trim: true, uppercase: true, unique: true },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  middleName: { type: String, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  mobileNumber: { type: String, required: true, trim: true },
  profileImage: { key: { type: String }, url: { type: String } },
  address: {
    addressLine: { type: String, trim: true, default: '' },
    state: { type: Schema.Types.ObjectId, ref: 'State' },
    district: { type: Schema.Types.ObjectId, ref: 'District' },
    city: { type: String, trim: true },
    pincode: { type: String, trim: true }
  },
  role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  reportingTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  hierarchyPath: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  isActive: { type: Boolean, default: true, index: true },
  isVerified: { type: Boolean, default: false },
  passwordHash: { type: String, select: false },
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockedUntil: { type: Date, select: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });

employeeSchema.index({ hierarchyPath: 1 });
employeeSchema.index({ reportingTo: 1, isActive: 1 });
employeeSchema.index({ role: 1, isActive: 1 });
employeeSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
employeeSchema.index({ mobileNumber: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

export type EmployeeDocument = InferSchemaType<typeof employeeSchema>;
export const EmployeeModel = model('Employee', employeeSchema);
