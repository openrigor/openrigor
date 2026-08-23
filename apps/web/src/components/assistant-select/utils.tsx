import { User } from "lucide-react";
import React from "react";
import { ICON_REGISTRY } from "@/lib/icon-registry";

export const getIcon = (iconName?: string) => {
  if (iconName && ICON_REGISTRY[iconName]) {
    return React.createElement(ICON_REGISTRY[iconName]);
  }
  return React.createElement(User);
};
