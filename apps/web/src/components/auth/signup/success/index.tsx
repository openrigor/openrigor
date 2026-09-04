"use client";

import { useEffect, useState } from "react";
import { redirect, RedirectType } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import { useTranslations } from "next-intl";

export function SignupSuccess() {
  const t = useTranslations("auth");
  const { getUser, user } = useUserContext();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (user) {
      return;
    }
    const startTime = Date.now();
    const checkDuration = 3 * 60 * 1000; // 3 minutes in milliseconds
    const interval = 4000; // 4 seconds

    const checkUser = async () => {
      await getUser();
      if (Date.now() - startTime >= checkDuration) {
        setIsChecking(false);
      }
    };

    const intervalId = setInterval(checkUser, interval);

    // Initial check
    checkUser();

    // Cleanup function
    return () => clearInterval(intervalId);
  }, [getUser]);

  useEffect(() => {
    if (user) {
      redirect("/workspace", RedirectType.push);
    }
  }, [user]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">{t("successfullySignedUp")}</h1>
        <p className="text-gray-600 mb-4">{t("checkEmailConfirmation")}</p>
        <p className="text-sm text-gray-500">{t("checkSpamFolder")}</p>
        {isChecking && (
          <p className="text-sm text-blue-500 mt-4">
            {t("waitingForConfirmation")}
          </p>
        )}
      </div>
    </div>
  );
}
