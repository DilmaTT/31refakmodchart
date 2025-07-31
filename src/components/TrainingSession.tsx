import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PokerMatrix } from "./PokerMatrix";
import { PokerCard } from "./PokerCard";
import { TrainingResultsDialog } from "./TrainingResultsDialog";
import { X, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRangeContext, ActionButton } from "@/contexts/RangeContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { allPossibleHands, generateBorderHands, getCombinations, TOTAL_POKER_COMBINATIONS } from "@/lib/poker-utils";

interface TrainingSessionProps {
  training: any;
  onStop: () => void;
}

const getActionColor = (actionId: string, allButtons: ActionButton[]): string => {
    if (actionId === 'fold') return '#6b7280';
    const button = allButtons.find(b => b.id === actionId);
    if (button && button.type === 'simple') {
        return button.color;
    }
    return '#ffffff';
};

const getActionButtonStyle = (button: ActionButton, allButtons: ActionButton[]) => {
    if (button.type === 'simple') {
        return { backgroundColor: button.color, color: 'white' };
    }
    if (button.type === 'weighted') {
        const color1 = getActionColor(button.action1Id, allButtons);
        const color2 = getActionColor(button.action2Id, allButtons);
        return {
            background: `linear-gradient(to right, ${color1} ${button.weight}%, ${color2} ${button.weight}%)`,
            color: 'white',
        };
    }
    return {};
};

export const TrainingSession = ({ training, onStop }: TrainingSessionProps) => {
  const { folders, actionButtons } = useRangeContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const [currentHand, setCurrentHand] = useState<string>('');
  const [handsForTraining, setHandsForTraining] = useState<string[]>([]);
  const [currentRangeIndex, setCurrentRangeIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    startTime: Date.now(),
    hands: [] as Array<{hand: string, correct: boolean, userAction?: string, correctAction?: string}>,
    accuracy: 0
  });
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [showCorrectRange, setShowCorrectRange] = useState(false);
  const [userMatrix, setUserMatrix] = useState<Record<string, string>>({});
  const [isChecked, setIsChecked] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [activeAction, setActiveAction] = useState<string>(() => actionButtons[0]?.id || '');
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [trainingResults, setTrainingResults] = useState<any>(null);

  const trainingRanges = useMemo(() => {
    const ranges = [];
    if (!training.ranges) return [];
    for (const rangeId of training.ranges) {
      for (const folder of folders) {
        const range = folder.ranges.find(r => r.id === rangeId);
        if (range) {
          ranges.push({ ...range, folderName: folder.name });
        }
      }
    }
    return ranges;
  }, [folders, training.ranges]);

  const currentRange = trainingRanges[currentRangeIndex];
  
  const getSelectedCombinationsCount = () => {
    if (!userMatrix) return 0;
    let count = 0;
    Object.entries(userMatrix).forEach(([hand, action]) => {
        const combinations = getCombinations(hand);
        if (action && action !== 'fold' && typeof combinations === 'number' && !isNaN(combinations)) {
            count += combinations;
        }
    });
    return count;
  };
  
  const getSelectedCombinationsPercentage = () => {
      const selectedCount = getSelectedCombinationsCount();
      return TOTAL_POKER_COMBINATIONS > 0 ? Math.round((selectedCount / TOTAL_POKER_COMBINATIONS) * 100) : 0;
  };

  const generateNewClassicHand = () => {
    const randomIndex = Math.floor(Math.random() * allPossibleHands.length);
    setCurrentHand(allPossibleHands[randomIndex]);
  };

  useEffect(() => {
    if (!currentRange) return;

    if (training.type === 'classic') {
      if (training.subtype === 'all-hands') {
        generateNewClassicHand();
      } else if (training.subtype === 'border-check') {
        const handPool = generateBorderHands(currentRange.hands, training.borderExpansionLevel);
        setHandsForTraining(handPool);
        if (handPool.length > 0) {
          const randomIndex = Math.floor(Math.random() * handPool.length);
          setCurrentHand(handPool[randomIndex]);
        } else {
            toast({
                title: "Не удалось определить границу ренжа",
                description: "Ренж может быть пустым, занимать всю матрицу или не содержать граничных рук.",
                variant: "warning",
            });
            setCurrentHand('');
        }
      }
    }
  }, [training.type, training.subtype, training.borderExpansionLevel, currentRange]);

  const getCorrectAction = (hand: string) => {
    if (!currentRange || !hand) return 'fold';
    return currentRange.hands[hand] || 'fold';
  };

  const filteredActionButtons = actionButtons.filter(button => {
    if (!currentRange || !currentRange.hands) return false;

    const usedActions = Object.values(currentRange.hands);
    
    if (button.type === 'simple') {
      return usedActions.includes(button.id);
    } else if (button.type === 'weighted') {
      return usedActions.includes(button.id); 
    }
    return false;
  });

  const handleClassicAnswer = (action: string) => {
    if (feedback || !currentHand) return;

    const correctAction = getCorrectAction(currentHand);
    const isCorrect = action === correctAction;
    
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    
    const newHandStat = {
      hand: currentHand,
      correct: isCorrect,
      userAction: action,
      correctAction
    };
    
    setSessionStats(prev => {
      const newHands = [...prev.hands, newHandStat];
      const correctCount = newHands.filter(h => h.correct).length;
      const accuracy = (correctCount / newHands.length) * 100;
      return { ...prev, hands: newHands, accuracy };
    });

    if (isCorrect) {
      setTimeout(() => {
        proceedToNext();
      }, 1500);
    } else {
      setShowCorrectRange(true);
    }
  };

  const handleMatrixSelect = (hand: string) => {
    if (isChecked) return;

    if (!activeAction) {
        toast({
            title: "Действие не выбрано",
            description: "Пожалуйста, сначала создайте кнопки действий в редакторе.",
            variant: "destructive",
        });
        return;
    }
    
    const newMatrix = { ...userMatrix };
    if (newMatrix[hand] === activeAction) {
      delete newMatrix[hand];
    } else {
      newMatrix[hand] = activeAction;
    }
    setUserMatrix(newMatrix);
  };

  const checkBorderRepeat = () => {
    if (!currentRange) return;
    
    const correctHands = currentRange.hands;
    const isCorrect = Object.keys(correctHands).every(hand => 
      userMatrix[hand] === correctHands[hand]
    ) && Object.keys(userMatrix).every(hand => 
      correctHands[hand] === userMatrix[hand]
    );
    
    setIsChecked(true);
    setCanProceed(true);
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    
    if (!isCorrect) {
      setShowCorrectRange(true);
    }

    const newRangeStat = {
      hand: currentRange.name,
      correct: isCorrect,
      userAction: 'matrix',
      correctAction: 'matrix'
    };
    
    setSessionStats(prev => {
      const newHands = [...prev.hands, newRangeStat];
      const correctCount = newHands.filter(h => h.correct).length;
      const accuracy = (correctCount / newHands.length) * 100;
      return { ...prev, hands: newHands, accuracy };
    });
  };

  const proceedToNext = () => {
    if (training.type === 'classic') {
      if (training.subtype === 'all-hands') {
        generateNewClassicHand();
      } else if (training.subtype === 'border-check') {
        if (handsForTraining.length > 0) {
          const nextHandIndex = Math.floor(Math.random() * handsForTraining.length);
          setCurrentHand(handsForTraining[nextHandIndex]);
        } else {
          finishTraining();
          return;
        }
      }
    } else {
      if (currentRangeIndex < trainingRanges.length - 1) {
        setCurrentRangeIndex(prev => prev + 1);
        setUserMatrix({});
        setIsChecked(false);
        setCanProceed(false);
        setActiveAction(actionButtons[0]?.id || '');
      } else {
        finishTraining();
        return;
      }
    }
    
    setFeedback(null);
    setShowCorrectRange(false);
  };

  const finishTraining = () => {
    const finishTime = Date.now();
    const duration = finishTime - sessionStats.startTime;
    const correctAnswers = sessionStats.hands.filter(h => h.correct).length;
    const totalQuestions = sessionStats.hands.length;
    const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    if (totalQuestions > 0) {
      const sessionDataToSave = {
        trainingId: training.id,
        timestamp: finishTime,
        duration: duration,
        totalQuestions: totalQuestions,
        correctAnswers: correctAnswers,
      };
      
      const savedStats = JSON.parse(localStorage.getItem('training-statistics') || '[]');
      savedStats.push(sessionDataToSave);
      localStorage.setItem('training-statistics', JSON.stringify(savedStats));
    }
    
    const resultsForDialog = {
      trainingName: training.name,
      type: training.type,
      duration: duration,
      accuracy: accuracy,
      totalQuestions: totalQuestions,
      correctAnswers: correctAnswers,
      timestamp: finishTime,
    };

    setTrainingResults(resultsForDialog);
    setShowResultsDialog(true);
  };

  const handleCloseResults = () => {
    setShowResultsDialog(false);
    onStop();
  };

  const formatTime = () => {
    const elapsed = Date.now() - sessionStats.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!currentRange) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <Card className="p-6 text-center">
          <p className="text-lg text-muted-foreground">Ренжи для тренировки не найдены</p>
          <Button onClick={onStop} className="mt-4">Вернуться</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex flex-col sm:flex-row">
      <div className="hidden sm:block w-80 bg-card border-r p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Статистика</h2>
        </div>
        
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{formatTime()}</div>
            <div className="text-sm text-muted-foreground">Время</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{sessionStats.accuracy.toFixed(1)}%</div>
            <div className="text-sm text-muted-foreground">Точность</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{sessionStats.hands.length}</div>
            <div className="text-sm text-muted-foreground">
              {training.type === 'classic' ? 'Рук сыграно' : 'Ренжей проверено'}
            </div>
          </div>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          <h3 className="text-sm font-medium text-muted-foreground">История</h3>
          {sessionStats.hands.map((stat, index) => (
            <div
              key={index}
              className={cn(
                "p-2 rounded text-sm",
                stat.correct 
                  ? "bg-green-500/20 text-green-700 dark:text-green-300" 
                  : "bg-red-500/20 text-red-700 dark:text-red-300"
              )}
            >
              {stat.hand}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="sm:hidden px-4 py-2 border-b bg-card">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">
              {currentRange.folderName} - {currentRange.name}
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {training.type === 'classic' ? (
              <div className="space-y-6">
                <div className="hidden sm:block text-center">
                  <h1 className="text-2xl font-bold mb-2">
                    {currentRange.folderName} - {currentRange.name}
                  </h1>
                  <p className="text-muted-foreground">
                    Текущая рука: {currentHand}
                  </p>
                </div>
                
                <div className="relative mx-auto w-full max-w-2xl">
                  <div className={cn(
                    "relative bg-poker-felt rounded-full border-8 border-poker-table shadow-2xl transition-all duration-300",
                    "w-full aspect-[3/2] max-w-lg mx-auto",
                    feedback === 'correct' && "shadow-green-500/50",
                    feedback === 'incorrect' && "shadow-red-500/50"
                  )}>
                    <div className="absolute inset-4 rounded-full bg-gradient-to-br from-poker-felt to-poker-green opacity-90"></div>
                    
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <div className="bg-black rounded-full p-4 shadow-xl border-4 border-gray-800">
                        <PokerCard hand={currentHand} className="scale-90 sm:scale-100" />
                      </div>
                    </div>
                    
                    {feedback === 'incorrect' && (
                      <div className="absolute top-1/2 right-8 sm:right-12 transform -translate-y-1/2">
                        <Button
                          onClick={proceedToNext}
                          className="bg-gray-500 hover:bg-gray-600 text-white w-[45px] h-[45px] sm:w-[55px] sm:h-[55px] rounded-lg shadow-xl border-2 border-gray-700"
                          size="icon"
                        >
                          <Play className="h-5 w-5 sm:h-6 sm:w-6" />
                        </Button>
                      </div>
                    )}
                    
                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                      <div className="text-white/60 text-sm font-semibold">DEALER</div>
                    </div>
                  </div>
                  
                  <div className="sm:hidden text-center mt-4">
                    <p className="text-muted-foreground text-sm">
                      Рука {sessionStats.hands.length + 1}: <span className="font-bold text-primary">{currentHand}</span>
                    </p>
                  </div>
                </div>

                <div className="flex justify-center gap-2 sm:gap-3 flex-wrap px-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleClassicAnswer('fold')}
                    disabled={!!feedback}
                    className={cn(
                      "bg-gray-500 text-white hover:bg-gray-600 text-xs sm:text-sm px-3 sm:px-4",
                      feedback === 'incorrect' && getCorrectAction(currentHand) === 'fold' && "ring-2 ring-green-500"
                    )}
                  >
                    FOLD
                  </Button>
                  {filteredActionButtons.map((button) => (
                    <Button
                      key={button.id}
                      size="sm"
                      onClick={() => handleClassicAnswer(button.id)}
                      disabled={!!feedback}
                      style={getActionButtonStyle(button, actionButtons)}
                      className={cn(
                        "text-white hover:opacity-80 text-xs sm:text-sm px-3 sm:px-4",
                        feedback === 'incorrect' && getCorrectAction(currentHand) === button.id && "ring-2 ring-green-500"
                      )}
                    >
                      {button.name}
                    </Button>
                  ))}
                </div>

                {showCorrectRange && (
                  <div className="space-y-4">
                    <h3 className="text-center text-lg font-semibold">Правильный ренж:</h3>
                    <div className="overflow-x-auto">
                      <PokerMatrix
                        selectedHands={currentRange.hands}
                        onHandSelect={() => {}}
                        activeAction=""
                        actionButtons={actionButtons}
                        readOnly
                      />
                    </div>
                  </div>
                )}

                <div className="text-center mt-6">
                  <Button onClick={finishTraining} variant="destructive" size="lg">
                    Завершить
                  </Button>
                </div>
              </div>
            ) : (
              // BORDER REPEAT TRAINING
              <>
                {isMobile ? (
                  // --- MOBILE LAYOUT for Border Repeat ---
                  <div className="space-y-2 sm:space-y-2">
                    <div className="overflow-x-auto pb-1 -mt-6 sm:mt-0">
                      <PokerMatrix
                        selectedHands={showCorrectRange ? currentRange.hands : userMatrix}
                        onHandSelect={handleMatrixSelect}
                        activeAction={activeAction}
                        actionButtons={actionButtons}
                        readOnly={isChecked}
                        initialScale={1}
                      />
                    </div>
                    <div className="flex justify-center gap-2 sm:gap-3 flex-wrap px-2 sm:px-4">
                      {filteredActionButtons.map((button) => (
                        <Button
                          key={button.id}
                          size="sm"
                          onClick={() => setActiveAction(button.id)}
                          disabled={isChecked}
                          style={{ backgroundColor: button.color }}
                          className={cn(
                            "text-white hover:opacity-80 text-xs sm:text-sm px-2 sm:px-4 h-7 py-1",
                            activeAction === button.id && "ring-2 ring-white"
                          )}
                        >
                          {button.name}
                        </Button>
                      ))}
                    </div>
                    <div className="flex justify-center items-center gap-2 sm:gap-4 px-4">
                      <Button
                        onClick={checkBorderRepeat}
                        disabled={isChecked}
                        variant={feedback === 'correct' ? 'default' : feedback === 'incorrect' ? 'destructive' : 'poker'}
                        className={cn("h-7 py-1", feedback === 'correct' ? 'bg-green-600 hover:bg-green-700' : '')}
                        size="sm"
                      >
                        Проверить
                      </Button>
                      {canProceed && (
                        <Button
                          onClick={proceedToNext}
                          className="bg-gray-500 hover:bg-gray-600 text-white w-8 h-8 rounded-lg shadow-lg border-2 border-gray-700"
                          size="icon"
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      <Button onClick={finishTraining} variant="destructive" size="sm" className="h-7 py-1">
                        Завершить
                      </Button>
                    </div>
                  </div>
                ) : (
                  // --- DESKTOP LAYOUT for Border Repeat ---
                  <div className="space-y-4 lg:w-[63%] mx-auto">
                    <div className="flex justify-between items-end">
                      <div className="text-left">
                        <h2 className="text-base font-bold text-muted-foreground mb-px">
                          {currentRange.folderName}
                        </h2>
                        <h1 className="text-sm font-normal ml-1">
                          {currentRange.name}
                        </h1>
                      </div>
                      <div className="bg-background/80 px-2 py-1 rounded text-xs font-mono flex items-center gap-1 z-10">
                        <span className="text-primary font-bold">{getSelectedCombinationsPercentage()}%</span>
                        <span className="text-muted-foreground">({getSelectedCombinationsCount()})</span>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <PokerMatrix
                            selectedHands={showCorrectRange ? currentRange.hands : userMatrix}
                            onHandSelect={handleMatrixSelect}
                            activeAction={activeAction}
                            actionButtons={actionButtons}
                            readOnly={isChecked}
                        />
                    </div>

                    <div className="flex justify-center gap-2 sm:gap-3 flex-wrap px-2 sm:px-4">
                      {filteredActionButtons.map((button) => (
                        <Button
                          key={button.id}
                          size="sm"
                          onClick={() => setActiveAction(button.id)}
                          disabled={isChecked}
                          style={{ backgroundColor: button.color }}
                          className={cn(
                            "text-white hover:opacity-80 text-xs sm:text-sm px-2 sm:px-4 h-7 py-1",
                            activeAction === button.id && "ring-2 ring-white"
                          )}
                        >
                          {button.name}
                        </Button>
                      ))}
                    </div>

                    <div className="flex justify-center items-center gap-2 sm:gap-4 px-4">
                      <Button
                        onClick={checkBorderRepeat}
                        disabled={isChecked}
                        variant={feedback === 'correct' ? 'default' : feedback === 'incorrect' ? 'destructive' : 'poker'}
                        className={cn("h-7 py-1", feedback === 'correct' ? 'bg-green-600 hover:bg-green-700' : '')}
                        size="sm"
                      >
                        Проверить
                      </Button>
                      {canProceed && (
                        <Button
                          onClick={proceedToNext}
                          className="bg-gray-500 hover:bg-gray-600 text-white w-8 h-8 rounded-lg shadow-lg border-2 border-gray-700"
                          size="icon"
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      <Button onClick={finishTraining} variant="destructive" size="sm" className="h-7 py-1">
                        Завершить
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="sm:hidden p-0 border-t bg-card">
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-sm font-bold text-primary">{formatTime()}</div>
              <div className="text-xs text-muted-foreground">Время</div>
            </div>
            
            <div>
              <div className="text-sm font-bold text-primary">{sessionStats.accuracy.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Точность</div>
            </div>
            
            <div>
              <div className="text-sm font-bold text-primary">{sessionStats.hands.length}</div>
              <div className="text-xs text-muted-foreground">
                {training.type === 'classic' ? 'Рук' : 'Ренжей'}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {trainingResults && (
        <TrainingResultsDialog
          open={showResultsDialog}
          onClose={handleCloseResults}
          results={trainingResults}
        />
      )}
    </div>
  );
};
