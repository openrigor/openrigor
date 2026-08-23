import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Undo2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface EditActionBarProps {
  isActive: boolean;
  onKeep: () => void;
  onUndo: () => void;
}

export function EditActionBar({
  isActive,
  onKeep,
  onUndo,
}: EditActionBarProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl py-3 px-4 shadow-lg"
          data-testid="edit-action-bar"
        >
          <span className="text-sm text-yellow-800 font-medium">
            AI made changes to your text
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={onKeep}
            data-testid="edit-keep-btn"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Keep
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={onUndo}
            data-testid="edit-undo-btn"
          >
            <Undo2 className="w-4 h-4 mr-1" />
            Undo
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
