import React from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"; // Assuming shadcn UI Tooltip

interface InfoIconProps {
  description: React.ReactNode;
  size?: number;
  className?: string;
}

const InfoIcon: React.FC<InfoIconProps> = ({ description, size = 16, className }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={`ml-2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none ${className}`}>
            <Info size={size} className="text-gray-500 dark:text-gray-400" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs bg-gray-800 text-white p-2 rounded shadow-lg text-sm">
          {typeof description === 'string' ? <p>{description}</p> : description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoIcon; 