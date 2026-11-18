/**
 * The phone's tab bar as a slot: each list screen places `<TabBar />` at its bottom, and the app shell
 * (src/shell) fills it. So the features need not import the shell, which itself shows features.
 */
import { createContext, type ReactNode, useContext } from "react";

const TabBarContext = createContext<ReactNode>(null);

export const TabBarProvider = ({
  tabBar,
  children,
}: {
  tabBar: ReactNode;
  children: ReactNode;
}) => <TabBarContext.Provider value={tabBar}>{children}</TabBarContext.Provider>;

export const TabBar = () => <>{useContext(TabBarContext)}</>;
