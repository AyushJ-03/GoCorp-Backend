import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { Office } from './office.model.js';

export const createOffice = async (req, res, next) => {
  try {
    const {
      name,
      company_id,
      address,
      office_location,
      shift_start,
      shift_end,
      working_days,
    } = req.body;

    const office = await Office.create({
      name,
      company_id,
      address,
      office_location,
      shift_start,
      shift_end,
      working_days,
    });

    res.status(201).json(new ApiResponse(201, "Office registered successfully", office))
  } catch (error) {
    next(error)
  }
};

export const getOfficeById = async (req, res, next) => {
  try {
    const { office_id } = req.params;
    
    if (!office_id || office_id.length !== 24) {
       return next(new ApiError(400, "Invalid office ID format"));
    }

    const office = await Office.findById(office_id);
    
    if (!office) {
      return next(new ApiError(404, "Office not found"));
    }

    res.status(200).json(new ApiResponse(200, "Office details retrieved successfully", office));
  } catch (error) {
    next(new ApiError(500, error.message || "Internal server error"));
  }
};