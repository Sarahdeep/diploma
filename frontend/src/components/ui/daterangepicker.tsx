'use client'

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { ControllerRenderProps } from "react-hook-form"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerWithRangeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  field: ControllerRenderProps<any, 'dateRange'>;
  containerRef?: React.RefObject<HTMLDivElement>; // Make optional since we're not using it with shadcn
  disabled?: boolean;
}

export function DatePickerWithRange({
  className,
  field,
  containerRef, // Keep for compatibility
  disabled = false
}: DatePickerWithRangeProps) {
  // Состояние для контроля открытия/закрытия попапа
  const [open, setOpen] = React.useState(false);

  // Ensure date is correctly formatted as DateRange for the Calendar component
  const date: DateRange | undefined = field?.value ? 
    { from: field.value.from || undefined, to: field.value.to || undefined } : 
    undefined;

  // Добавим обработчик для отладки
  const handleButtonClick = (e: React.MouseEvent) => {
    console.log('Button clicked', e);
    // Явно открываем попап при клике на кнопку
    if (!open) {
      setOpen(true);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !field?.value && "text-muted-foreground"
            )}
            disabled={disabled}
            onClick={handleButtonClick}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Выберите диапазон дат</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 z-[100]" 
          align="start"
          side="bottom"
          sideOffset={4}
          forceMount
          style={{
            position: 'absolute',
            backgroundColor: 'white',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
          }}
        >
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(selectedDate) => {
              field?.onChange(selectedDate);
              // Закрываем попап только когда выбран полный диапазон
              if (selectedDate?.from && selectedDate?.to) {
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
} 