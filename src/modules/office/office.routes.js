import { Router } from "express"
import { createOffice, getOfficeById } from "./office.controller.js"

const router = Router()

router.post('/add-office', createOffice)
router.get('/:office_id', getOfficeById)

export default router