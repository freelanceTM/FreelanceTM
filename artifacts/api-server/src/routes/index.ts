import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import gigsRouter from "./gigs";
import tendersRouter from "./tenders";
import ordersRouter from "./orders";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(gigsRouter);
router.use(tendersRouter);
router.use(ordersRouter);
router.use(usersRouter);

export default router;
