
import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { useDebounce } from '@/hooks/useDebounce';

interface TimeControlsProps {
  onTimeChange?: (time: Date, index: number) => void;
  autoPlay?: boolean;
  availableTimes?: Date[];
  timeZone?: string;
  compact?: boolean;
}

const TimeControls: React.FC<TimeControlsProps> = ({ onTimeChange, autoPlay = false, availableTimes = [], timeZone, compact = false }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const hasInitialized = useRef(false);
  
  // ADDED: Debounce the current index to prevent rapid updates
  const debouncedIndex = useDebounce(currentIndex, 150);

  // Initialize to closest time to now ONLY ONCE when data loads
  useEffect(() => {
    if (availableTimes.length > 0 && !hasInitialized.current) {
      console.log('🕐 TIME CONTROLS: First-time initialization with timestamps');
      
      // Find the index closest to current time for initial position
      const now = new Date();
      let closestIndex = 0;
      let minDiff = Math.abs(availableTimes[0].getTime() - now.getTime());
      
      for (let i = 1; i < availableTimes.length; i++) {
        const diff = Math.abs(availableTimes[i].getTime() - now.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      
      console.log(`🕐 TIME CONTROLS: Setting initial index to ${closestIndex} (closest to now)`);
      setCurrentIndex(closestIndex);
      hasInitialized.current = true;
    }
  }, [availableTimes.length]); // Only depend on length, not the full array

  // FIXED: Use debounced index to prevent rapid fire updates
  useEffect(() => {
    if (availableTimes.length > 0 && onTimeChange && availableTimes[debouncedIndex] && hasInitialized.current) {
      const selectedTime = availableTimes[debouncedIndex];
      console.log(`🕐 TIME CONTROLS: Notifying parent of DEBOUNCED time change: ${selectedTime.toISOString()} (index ${debouncedIndex})`);
      onTimeChange(selectedTime, debouncedIndex);
    }
  }, [debouncedIndex, availableTimes, onTimeChange]);

  // Auto-play functionality
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && availableTimes.length > 0) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= availableTimes.length) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 1000); // Change frame every second
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, availableTimes.length]);

  const handleSliderChange = (values: number[]) => {
    const newIndex = values[0];
    console.log(`🕐 TIME CONTROLS: User manually changed slider to index ${newIndex}`);
    setCurrentIndex(newIndex);
    setIsPlaying(false);
  };

  const handlePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStepBack = () => {
    const newIndex = Math.max(0, currentIndex - 1);
    console.log(`🕐 TIME CONTROLS: Step back to index ${newIndex}`);
    setCurrentIndex(newIndex);
    setIsPlaying(false);
  };

  const handleStepForward = () => {
    const newIndex = Math.min(availableTimes.length - 1, currentIndex + 1);
    console.log(`🕐 TIME CONTROLS: Step forward to index ${newIndex}`);
    setCurrentIndex(newIndex);
    setIsPlaying(false);
  };

  const handleReset = () => {
    // Reset to the earliest available time
    console.log('🕐 TIME CONTROLS: Reset to index 0');
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  if (availableTimes.length === 0) {
    return null;
  }

  const currentTime = availableTimes[currentIndex];
  const now = new Date();
  const isCurrentTime = Math.abs(currentTime.getTime() - now.getTime()) < (30 * 60 * 1000); // Within 30 minutes of now

  // Calculate time range for display
  const earliestTime = availableTimes[0];
  const latestTime = availableTimes[availableTimes.length - 1];
  const totalHours = Math.round((latestTime.getTime() - earliestTime.getTime()) / (1000 * 60 * 60));

  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
      <div className={`${compact ? 'p-2' : 'p-3 md:p-4'} space-y-2 md:space-y-3`}>
        {/* Current Time Display */}
        <div className="text-center">
          <div className="text-base md:text-lg font-bold text-foreground">
            {currentTime.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: timeZone || 'America/Denver'
            })}
          </div>
          <div className="text-xs md:text-sm text-muted-foreground">
            {isCurrentTime ? 'Current Conditions' : 'Forecast Time'}
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="space-y-1 md:space-y-2">
          <Slider
            value={[currentIndex]}
            onValueChange={handleSliderChange}
            max={availableTimes.length - 1}
            min={0}
            step={1}
            className="w-full"
          />
          {!compact && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{earliestTime.toLocaleDateString()}</span>
              <span>+{totalHours}h total</span>
            </div>
          )}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-1 md:space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-7 w-7 md:h-8 md:w-8 p-0"
          >
            <RotateCcw className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleStepBack}
            disabled={currentIndex === 0}
            className="h-7 w-7 md:h-8 md:w-8 p-0"
          >
            <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
          
          <Button
            variant="default"
            size="sm"
            onClick={handlePlay}
            className="h-7 w-10 md:h-8 md:w-12 p-0"
          >
            {isPlaying ? (
              <Pause className="h-3 w-3 md:h-4 md:w-4" />
            ) : (
              <Play className="h-3 w-3 md:h-4 md:w-4 ml-0.5" />
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleStepForward}
            disabled={currentIndex === availableTimes.length - 1}
            className="h-7 w-7 md:h-8 md:w-8 p-0"
          >
            <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
        </div>

        {/* Time Labels */}
        {!compact && (
          <div className="text-center text-xs text-muted-foreground">
            Frame {currentIndex + 1} of {availableTimes.length}
          </div>
        )}
      </div>
    </Card>
  );
};

export default TimeControls;
