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
}


export default function SetNameStepsModal({
    open,
    onClose,
    title,
    subtitle,
    steps
}: SetNameStepsModalProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [executing, setExecuting] = useState(false)
    const [lastTxHash, setLastTxHash] = useState<string | null>(null)
    const [allStepsCompleted, setAllStepsCompleted] = useState(false)
    const [stepStatuses, setStepStatuses] = useState<("pending" | "completed" | "error")[]>(
        Array(steps?.length || 0).fill("pending")
    )

    const [stepTxHashes, setStepTxHashes] = useState<(string | null)[]>(
        Array(steps?.length || 0).fill(null)
    )

    const { chain } = useAccount()
    const config = chain?.id ? CONTRACTS[chain.id] : undefined;

    useEffect(() => {
        if (!open || !steps || steps.length === 0) return

        setCurrentStep(0)
        setExecuting(false)
        setStepStatuses(Array(steps.length).fill("pending"))
        setStepTxHashes(Array(steps.length).fill(null))
        setLastTxHash(null)
        setAllStepsCompleted(false)
    }, [open, steps])

    const runStep = async (index: number) => {
        try {
            setExecuting(true)
            const tx = await steps[index].action()
            if (tx) {
                const receipt = await tx.wait()
                const txHash = receipt?.hash ?? null

                setStepTxHashes((prev) => {
                    const updated = [...prev]
                    updated[index] = txHash
                    return updated
                })

                setLastTxHash(txHash) // store latest tx
            }
            updateStepStatus(index, "completed")
            if (index + 1 < steps.length) {
                setCurrentStep(index + 1)
            } else {
                setCurrentStep(steps.length)
                setAllStepsCompleted(true)
            }
        } catch (err: any) {
            if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
                updateStepStatus(index, "pending")
            } else {
                console.error("Step failed:", err)
                updateStepStatus(index, "error")
                onClose(`ERROR: ${err?.message || "Unknown error in step: " + steps[index]?.title}`)
            }
        } finally {
            setExecuting(false)
        }
    }

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
                    <DialogTitle className="text-xl text-gray-900 dark:text-white">{title}</DialogTitle>
                    <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
                        {subtitle}
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
                                            View
                                        </a>
                                    </Button>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm">No steps to display</p>
                    )}
                </div>

                <div className="mt-6">
                    {currentStep < steps.length ? (
                        <Button
                            onClick={() => runStep(currentStep)}
                            disabled={executing}
                            className="w-full"
                        >
                            {executing ? "Processing..." : currentStep === 0 ? "Start" : "Next Step"}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => onClose(lastTxHash)}
                            className="w-full"
                        >
                            Close
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
