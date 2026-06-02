import { createBrowserRouter } from "react-router";
import { Login } from "./components/Login";
import { MainMenu } from "./components/MainMenu";
import { Today } from "./components/Today";
import { Write } from "./components/Write";
import { History } from "./components/History";
import { Share } from "./components/Share";
import { Review } from "./components/Review";
import { Admin } from "./components/Admin";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
  },
  {
    path: "/today",
    Component: Today,
  },
  {
    path: "/menu",
    Component: MainMenu,
  },
  {
    path: "/write",
    Component: Write,
  },
  {
    path: "/history",
    Component: History,
  },
  {
    path: "/share",
    Component: Share,
  },
  {
    path: "/review",
    Component: Review,
  },
  {
    path: "/admin",
    Component: Admin,
  },
]);
