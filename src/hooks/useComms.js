// /src/hooks/useComms.js
import { useContext } from "react";
import { CommsContext } from "../context/CommsContext";

export function useComms() {
  const context = useContext(CommsContext);
  if (!context) {
    throw new Error("useComms must be used within a CommsProvider");
  }
  return context;
}
