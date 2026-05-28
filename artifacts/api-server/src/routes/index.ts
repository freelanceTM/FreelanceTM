import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import categoriesRouter from "./categories";
import gigsRouter from "./gigs";
import ordersRouter from "./orders";
import reviewsRouter from "./reviews";
import messagesRouter from "./messages";
import favoritesRouter from "./favorites";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(categoriesRouter);
router.use(gigsRouter);
router.use(ordersRouter);
router.use(reviewsRouter);
router.use(messagesRouter);
router.use(favoritesRouter);
router.use(aiRouter);

export default router;
