"use client";

import { createContext, useContext } from "react";

interface UserContextType {
  userName: string;
  userEmail: string;
  userRole: string;
}

export const UserContext = createContext<UserContextType>({
  userName: "",
  userEmail: "",
  userRole: "",
});

export const useUser = () => useContext(UserContext);