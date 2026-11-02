import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { BranchModel } from '../models/branch.model.js';
import { DistrictModel } from '../models/district.model.js';
import { StateModel } from '../models/state.model.js';

function id(value: string, field = 'ID'): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${field}`, 400);
  return new Types.ObjectId(value);
}

export const geographyService = {
  validateEmployeePlacement: async (stateValue: string, districtValue: string, branchValue?: string) => {
    const state = id(stateValue, 'state ID'); const district = id(districtValue, 'district ID');
    if (!await StateModel.exists({ _id: state, isActive: true }) || !await DistrictModel.exists({ _id: district, state, isActive: true })) {
      throw new AppError('Select an active district belonging to the selected state', 400);
    }
    if (branchValue) {
      const branch = id(branchValue, 'branch ID');
      if (!await BranchModel.exists({ _id: branch, state, district, isActive: true })) throw new AppError('Select an active branch belonging to the selected state and district', 400);
    }
  },
  listStates: () => StateModel.find({ isActive: true }).sort({ name: 1 }).select('name code isActive').lean(),
  listDistricts: async (stateId: string) => {
    const state = id(stateId, 'state ID');
    if (!await StateModel.exists({ _id: state, isActive: true })) return [];
    return DistrictModel.find({ state, isActive: true }).sort({ name: 1 }).select('name state isActive').lean();
  },
  listBranches: async (districtId: string) => {
    const district = id(districtId, 'district ID');
    if (!await DistrictModel.exists({ _id: district, isActive: true })) return [];
    return BranchModel.find({ district, isActive: true }).sort({ name: 1 }).select('name code state district address isActive').lean();
  },
  createState: async (input: { name: string; code?: string; isActive?: boolean }) => StateModel.create({ ...input, normalizedName: input.name.trim().toLowerCase() }),
  updateState: async (stateId: string, input: { name?: string; code?: string; isActive?: boolean }) => {
    const state = await StateModel.findById(id(stateId, 'state ID'));
    if (!state) throw new AppError('State not found', 404);
    if (input.isActive === false && state.isActive && await DistrictModel.exists({ state: state._id, isActive: true })) throw new AppError('Deactivate active districts before deactivating this state', 409);
    if (input.name !== undefined) { state.name = input.name; state.normalizedName = input.name.trim().toLowerCase(); }
    if (input.code !== undefined) state.code = input.code || null;
    if (input.isActive !== undefined) state.isActive = input.isActive;
    await state.save(); return state;
  },
  createDistrict: async (input: { name: string; state: string; isActive?: boolean }) => {
    const stateId = id(input.state, 'state ID');
    if (!await StateModel.exists({ _id: stateId, isActive: true })) throw new AppError('Active state not found', 404);
    return DistrictModel.create({ name: input.name, normalizedName: input.name.trim().toLowerCase(), state: stateId, isActive: input.isActive ?? true });
  },
  updateDistrict: async (districtId: string, input: { name?: string; isActive?: boolean }) => {
    const district = await DistrictModel.findById(id(districtId, 'district ID'));
    if (!district) throw new AppError('District not found', 404);
    if (input.isActive === true && !district.isActive && !await StateModel.exists({ _id: district.state, isActive: true })) throw new AppError('Activate the parent state before activating this district', 409);
    if (input.isActive === false && district.isActive && await BranchModel.exists({ district: district._id, isActive: true })) throw new AppError('Deactivate active branches before deactivating this district', 409);
    if (input.name !== undefined) { district.name = input.name; district.normalizedName = input.name.trim().toLowerCase(); }
    if (input.isActive !== undefined) district.isActive = input.isActive;
    await district.save(); return district;
  },
  createBranch: async (input: { name: string; code: string; state: string; district: string; address?: string; isActive?: boolean }) => {
    const stateId = id(input.state, 'state ID'); const districtId = id(input.district, 'district ID');
    const district = await DistrictModel.findOne({ _id: districtId, state: stateId, isActive: true });
    if (!district || !await StateModel.exists({ _id: stateId, isActive: true })) throw new AppError('Active district and matching state are required', 400);
    return BranchModel.create({ ...input, state: stateId, district: districtId });
  },
  updateBranch: async (branchId: string, input: { name?: string; code?: string; address?: string; isActive?: boolean }) => {
    const branch = await BranchModel.findById(id(branchId, 'branch ID'));
    if (!branch) throw new AppError('Branch not found', 404);
    if (input.isActive === true && !branch.isActive && (!await StateModel.exists({ _id: branch.state, isActive: true }) || !await DistrictModel.exists({ _id: branch.district, state: branch.state, isActive: true }))) throw new AppError('Activate the parent state and district before activating this branch', 409);
    if (input.name !== undefined) branch.name = input.name;
    if (input.code !== undefined) branch.code = input.code;
    if (input.address !== undefined) branch.address = input.address || null;
    if (input.isActive !== undefined) branch.isActive = input.isActive;
    await branch.save(); return branch;
  }
};
