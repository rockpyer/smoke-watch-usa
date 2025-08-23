
export const sanitizeSearchInput = (input: string): string => {
  // Remove potentially harmful characters and limit length
  return input
    .trim()
    .slice(0, 100) // Limit to 100 characters
    .replace(/[<>'"&]/g, '') // Remove basic XSS characters
    .replace(/[{}[\]]/g, ''); // Remove bracket characters
};

export const validateSearchInput = (input: string): boolean => {
  if (!input || input.length === 0) return false;
  if (input.length > 100) return false;
  
  // Allow letters, numbers, spaces, commas, periods, and basic punctuation
  const validPattern = /^[a-zA-Z0-9\s,.-]+$/;
  return validPattern.test(input);
};

export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};
