import ApiResponse from "../../utils/ApiResponse.js"
import { Company } from "./company.model.js"

export const registerCompanyController = async (req, res, next) => {
  try {
    const { name, companyContact, address, subscription } = req.body
    const company = await Company.create({ name, companyContact, address, subscription })
    res.status(201).json(new ApiResponse(201, "Company registered successfully", company))
  } catch (error) {
    next(error)
  }
}