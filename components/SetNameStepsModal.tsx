import React, { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle, Loader2, XCircle } from "lucide-react"
import { ethers } from 'ethers'
import { CONTRACTS, TOPIC0 } from '../utils/constants';
import { useAccount, useWalletClient } from 'wagmi'

export interface Step {
    title: string
    action: () => Promise<ethers.TransactionResponse | void>
}

export interface SetNameStepsModalProps {
    open: boolean;
    onClose: (lastTxHash?: string | null) => void;
    title: string;
    subtitle: string;
    steps: Step[];
    contractAddress?: string;
    ensName?: string;
    isPrimaryNameSet?: boolean;
}


export default function SetNameStepsModal({
    open,
    onClose,
    title,
    subtitle,
    steps,
    contractAddress,
    ensName,
    isPrimaryNameSet
}: SetNameStepsModalProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [executing, setExecuting] = useState(false)
    const [lastTxHash, setLastTxHash] = useState<string | null>(null)
    const [allStepsCompleted, setAllStepsCompleted] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [stepStatuses, setStepStatuses] = useState<("pending" | "completed" | "error")[]>(
        Array(steps?.length || 0).fill("pending")
    )

    const [stepTxHashes, setStepTxHashes] = useState<(string | null)[]>(
        Array(steps?.length || 0).fill(null)
    )

    const { chain } = useAccount()
    const config = chain?.id ? CONTRACTS[chain.id] : undefined;

    // Reset state when modal opens or closes
    useEffect(() => {
        console.log("Modal state changed", { open });

        // Reset all state when modal opens
        if (open && steps && steps.length > 0) {
            console.log("Resetting modal state");
            setCurrentStep(0);
            setExecuting(false);
            setStepStatuses(Array(steps.length).fill("pending"));
            setStepTxHashes(Array(steps.length).fill(null));
            setLastTxHash(null);
            setAllStepsCompleted(false);
            setErrorMessage("");
        }

        // Also reset when modal closes to ensure fresh state next time
        if (!open) {
            console.log("Modal closed, cleaning up state");
            setCurrentStep(0);
            setExecuting(false);
            setAllStepsCompleted(false);
        }
    }, [open, steps])

    // Auto-start the first step when modal opens
    useEffect(() => {
        console.log("Auto-start effect triggered", { open, stepsLength: steps?.length, executing, currentStep });

        // Only run this effect when the modal first opens
        if (open && steps && steps.length > 0 && currentStep === 0 && !executing) {
            console.log("Starting first step automatically");
            // Use a small timeout to ensure the modal is fully rendered
            setTimeout(() => {
                runStep(0);
            }, 100);
        }
    }, [open]); // Only depend on open to prevent re-running

    useEffect(() => {
        if (open && steps && steps.length > 0 && currentStep > 0 && currentStep < steps.length &&
            !executing && !errorMessage && stepStatuses[currentStep - 1] === "completed") {
            runStep(currentStep);
        }
    }, [currentStep, executing, errorMessage, stepStatuses]);

    const runStep = async (index: number) => {
        let tx = null;
        let errorMain = null;
        setExecuting(true);
        tx = await steps[index].action().catch((error) => {
            console.log("error", error)
            updateStepStatus(index, "error");
            setErrorMessage(error?.message || error.toString() || "Unknown error occurred.");
            errorMain = error
            return
        })


        try {
            if (tx) {
                const receipt = await tx.wait();
                const txHash = receipt?.hash ?? null;

                setStepTxHashes((prev) => {
                    const updated = [...prev];
                    updated[index] = txHash;
                    return updated;
                });

                setLastTxHash(txHash);
                updateStepStatus(index, "completed");
            }

            if (!errorMain) {
                updateStepStatus(index, "completed");
            }

            if (index + 1 < steps.length) {
                setCurrentStep(index + 1);
            } else {
                setCurrentStep(steps.length);
                setAllStepsCompleted(true);
            }
        } catch (error: any) {
            console.error("Step failed:", error);
            if (error?.code === "ACTION_REJECTED" || error?.code === 4001) {
                updateStepStatus(index, "pending");
            } else {
                updateStepStatus(index, "error");
                setErrorMessage(error?.message || error.toString() || "Unknown error occurred.");
            }
        } finally {
            setExecuting(false);
        }
    };

    const updateStepStatus = (index: number, status: "pending" | "completed" | "error") => {
        setStepStatuses(prev => {
            const updated = [...prev]
            updated[index] = status
            return updated
        })
    }

    const renderStepIcon = (index: number, status: "pending" | "completed" | "error", isCurrent: boolean) => {
        if (status === "completed") return <CheckCircle className="text-green-600 w-5 h-5" />
        if (status === "error") return <XCircle className="text-red-600 w-5 h-5" />
        if (isCurrent && executing) return <Loader2 className="animate-spin text-blue-600 w-5 h-5" />
        return (
            <div className="w-5 h-5 rounded-full bg-gray-300 text-xs flex items-center justify-center text-gray-700 font-semibold">
                {index + 1}
            </div>
        )
    }

    const handleDialogChange = (isOpen: boolean) => {
        if (!isOpen) {
            if (allStepsCompleted) {
                onClose(lastTxHash)
            } else {
                onClose("INCOMPLETE")
            }
        }
    }


    return (
        <Dialog open={open} onOpenChange={handleDialogChange}>
            <DialogContent className="bg-white dark:bg-gray-900 rounded-lg max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl text-gray-900 dark:text-white">
                        {allStepsCompleted
                            ? (title.includes("Deploy") ? "Deployment Successful!" : "Naming Contract Successful!")
                            : title}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
                        {allStepsCompleted
                            ? (title.includes("Deploy")
                                ? "Your contract has been successfully deployed."
                                : "Your contract has been named successfully.")
                            : subtitle}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {steps?.length ? (
                        steps.map((step, index) => (
                            <div key={index} className="flex items-start gap-3 justify-between">
                                <div className="flex items-center gap-3">
                                    {renderStepIcon(index, stepStatuses[index], index === currentStep)}
                                    <span className={`text-sm ${stepStatuses[index] === 'error' ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                        {step.title}
                                    </span>
                                </div>

                                {stepTxHashes[index] && (
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="secondary"
                                        className="text-xs px-2 py-1 h-auto"
                                    >
                                        <a
                                            href={`${config?.ETHERSCAN_URL}tx/${stepTxHashes[index]}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            View Tx
                                        </a>
                                    </Button>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm">No steps to display</p>
                    )}
                </div>

                {/* Show success content when steps are completed */}
                {allStepsCompleted && (
                    <div className="mt-6 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                        {/* Contract Address */}
                        {contractAddress && (
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Contract Address:</p>
                                <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                    {contractAddress}
                                </div>
                            </div>
                        )}

                        {/* ENS Name */}
                        {ensName && (
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">ENS Name:</p>
                                <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                    {ensName}
                                </div>
                            </div>
                        )}

                        {/* ENS Resolution Message */}
                        {isPrimaryNameSet !== undefined && (
                            <div className="text-red-500 dark:text-white font-semibold text-sm mt-4">
                                {isPrimaryNameSet
                                    ? "Primary ENS Name set for the contract Address"
                                    : "Only Forward Resolution of ENS name set for the contract address"}
                            </div>
                        )}

                        {/* View on Etherscan */}
                        {contractAddress && (
                            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                <a href={`${config?.ETHERSCAN_URL}address/${contractAddress}`} target="_blank" rel="noopener noreferrer">
                                    View Contract on Etherscan
                                </a>
                            </Button>
                        )}

                        {/* View on ENS App */}
                        {config?.ENS_APP_URL && ensName && (
                            <Button asChild className="w-full bg-green-600 hover:bg-green-700 text-white">
                                <a href={`${config.ENS_APP_URL}${ensName}`} target="_blank" rel="noopener noreferrer">
                                    View Name in ENS App
                                </a>
                            </Button>
                        )}
                    </div>
                )}

                {/* Show error message if there's an error */}
                {errorMessage ? (
                    <div className="mt-6 space-y-2">
                        <Button
                            onClick={() => onClose(`ERROR: ${errorMessage}`)}
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                        >
                            Close
                        </Button>
                    </div>
                ) : <div className="mt-6 space-y-2">
                    <Button
                        onClick={() => onClose()}
                        className="w-full"
                    >
                        Done
                    </Button>
                </div>}
            </DialogContent>
        </Dialog>
    )
}
