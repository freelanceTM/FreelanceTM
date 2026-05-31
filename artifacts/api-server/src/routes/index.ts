import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import gigsRouter from "./gigs";
import tendersRouter from "./tenders";
import ordersRouter from "./orders";
import usersRouter from "./users";
import walletRouter from "./wallet";
import adminRouter from "./admin";
import reviewsRouter from "./reviews";
import messagesRouter from "./messages";
import telegramRouter from "./telegram";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(gigsRouter);
router.use(tendersRouter);
router.use(ordersRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(adminRouter);
router.use(reviewsRouter);
router.use(messagesRouter);
router.use(telegramRouter);
router.use(aiRouter);

export default router;
