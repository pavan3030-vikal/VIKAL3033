"use client";
import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Input,
  VStack,
  HStack,
  Text,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Spinner,
  useClipboard,
  Tooltip,
  useToast,
  Avatar,
  useBreakpointValue,
  Flex,
  Link,
  Image,
  Switch,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Textarea,
} from "@chakra-ui/react";
import { ChevronDownIcon, ArrowRightIcon, CopyIcon, CheckIcon, ExternalLinkIcon, InfoIcon, AddIcon, ChevronRightIcon } from "@chakra-ui/icons";
import ReactMarkdown from "react-markdown";
import { auth } from "./lib/firebase";  // Correct relative path from src/app/dashboard/
import { signInWithPopup, GoogleAuthProvider, signOut, User, setPersistence, browserLocalPersistence } from "firebase/auth";
import { motion, Transition } from "framer-motion";  // Added Transition import
import { css } from "@emotion/react";
import { useRouter } from "next/navigation";

const MotionBox = motion.create(Box);

interface ChatHistory {
  id: string;
  question: string;
  response: string;
  subject: string;
  style: string;
  timestamp: number;
}

interface ResponseData {
  notes: string;
  flashcards?: string[];
  resources: { title: string; url: string }[];
  examTips?: string;
}

const API_URL = "https://vikal-backend3030-production.up.railway.app";
const RAZORPAY_LINK = "https://razorpay.com/payment-link/plink_Q0hzTfIX0l2sHx/test";

const responseTextStyles = css`
  .response-text {
    font-family: "Poppins", sans-serif;
  }
`;

const pageVariants = {
  initial: { opacity: 0, x: -100 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: 100 },
};

const pageTransition = {
  duration: 0.5,
  ease: "easeInOut",
} satisfies Transition;

const DashboardPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExam, setSelectedExam] = useState("Select Exam");
  const [selectedStyle, setSelectedStyle] = useState("Select Style");
  const [responseData, setResponseData] = useState<ResponseData>({ notes: "", resources: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>(() => {
    if (typeof window !== "undefined") {
      const storedChats = localStorage.getItem("vikalChats");
      return storedChats ? JSON.parse(storedChats).slice(0, 3) : [];
    }
    return [];
  });
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isSolveMode, setIsSolveMode] = useState(false);
  const [showTrialEndPopup, setShowTrialEndPopup] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("termsAccepted") === "true";
    }
    return false;
  });
  const [stats, setStats] = useState({ active_users: 0, questions_solved: 0, explanations_given: 0 });
  const [feedback, setFeedback] = useState("");
  const { hasCopied, onCopy } = useClipboard(responseData.notes);
  const toast = useToast();
  const router = useRouter();

  const padding = useBreakpointValue({ base: 3, md: 6 });
  const fontSize = useBreakpointValue({ base: "2xl", md: "4xl" });

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          setUser(user);
          if (user) {
            fetchStats();
            const storedChats = localStorage.getItem("vikalChats");
            const chatCount = storedChats ? JSON.parse(storedChats).length : 0;
            if (chatCount >= 3 && !localStorage.getItem("vikalPro")) {
              setShowTrialEndPopup(true);
            }
            if (storedChats) {
              setChatHistory(JSON.parse(storedChats).slice(0, 3));
            }
          }
        });
        const interval = setInterval(fetchStats, 10000);
        return () => {
          unsubscribe();
          clearInterval(interval);
        };
      })
      .catch((error) => {
        console.error("Persistence error:", error);
      });
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats`);
      if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast({ title: "Signed in! 🚀", status: "success", duration: 3000, position: "top" });
    } catch (error) {
      console.error("Sign-in error:", error);
      toast({ title: "Sign-in failed 😞", status: "error", duration: 3000, position: "top" });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      if (typeof window !== "undefined") {
        localStorage.removeItem("vikalChats");
        localStorage.removeItem("vikalPro");
        localStorage.removeItem("termsAccepted");
      }
      setChatHistory([]);
      setTermsAccepted(false);
      toast({ title: "Signed out! 👋", status: "success", duration: 3000, position: "top" });
    } catch (error) {
      console.error("Sign-out error:", error);
      toast({ title: "Sign-out failed 😞", status: "error", duration: 3000, position: "top" });
    }
  };

  const handleAcceptTerms = () => {
    setTermsAccepted(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("termsAccepted", "true");
    }
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setResponseData({ notes: "", resources: [] });
    try {
      if (chatHistory.length >= 3 && !localStorage.getItem("vikalPro")) {
        setIsProModalOpen(true);
        return;
      }

      const endpoint = isSolveMode ? `${API_URL}/solve` : `${API_URL}/explain`;
      const payloadKey = isSolveMode ? "problem" : "topic";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.uid ?? "anonymous",
          [payloadKey]: searchQuery,
          exam: selectedExam !== "Select Exam" && isSolveMode ? selectedExam.toLowerCase() : null,
          explanation_style: isSolveMode ? selectedStyle.toLowerCase() : null,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status} - ${await res.text()}`);
      const data = await res.json();
      console.log("API Response:", data);
      if (data.notes) {
        const examTips = await call_openai();
        setResponseData({
          notes: data.notes || "No notes provided.",
          flashcards: data.flashcards || [],
          resources: data.resources || [],
          examTips: examTips || "No exam tips generated.",
        });
        const newChatHistory = [
          {
            id: Date.now().toString(),
            question: searchQuery,
            response: data.notes,
            subject: "",
            style: isSolveMode ? selectedStyle : "generic",
            timestamp: Date.now(),
          },
          ...chatHistory,
        ].slice(0, 3);
        setChatHistory(newChatHistory);
        if (typeof window !== "undefined") {
          localStorage.setItem("vikalChats", JSON.stringify(newChatHistory));
        }
        fetchStats();
      } else if (data.error === "Chat limit reached. Upgrade to Pro for unlimited chats!") {
        setIsProModalOpen(true);
      } else {
        throw new Error(data.error || "No response from server");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast({ title: "Error", description: (error as Error).message || "Unknown error", status: "error", duration: 3000, position: "top" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) {
      toast({ title: "Please enter feedback", status: "warning", duration: 3000, position: "top" });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.uid ?? "anonymous", feedback }),
      });
      if (!res.ok) throw new Error(`Failed to submit feedback: ${res.status}`);
      toast({ title: "Thanks for your feedback!", status: "success", duration: 3000, position: "top" });
      setFeedback("");
    } catch (error) {
      console.error("Feedback error:", error);
      toast({ title: "Failed to submit feedback", status: "error", duration: 3000, position: "top" });
    }
  };

  const handleUpgradeToPro = () => {
    window.location.href = RAZORPAY_LINK;
  };

  const handlePageTransition = (path: string) => {
    router.push(path);
  };

  const call_openai = async () => {
    return new Promise((resolve) => {
      setTimeout(() => resolve("Sample exam tips: 1. Focus on key concepts. 2. Practice steps. 3. Memorize formulas."), 500);
    }) as Promise<string>;
  };

  const exams = ["UPSC", "GATE", "RRB"];
  const examStyles = ["Smart & Quick", "Step-by-Step", "Teacher Mode", "Research Style"];

  if (!user) {
    return (
      <MotionBox
        minH="100vh"
        bgGradient="linear(to-br, #0a0a0c, #1a1b1e)"
        color="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        position="relative"
        variants={pageVariants}
        initial="initial"
        animate="in"
        exit="out"
        transition={pageTransition}
      >
        <style jsx global>{`
          @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap");
        `}</style>
        <MotionBox
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bgGradient="radial(#ffdd57, transparent)"
          filter="blur(150px)"
          opacity={0.2}
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <MotionBox
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          bg="rgba(20, 20, 25, 0.9)"
          backdropFilter="blur(12px)"
          borderRadius="2xl"
          boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
          p={6}
          maxW="md"
          textAlign="center"
        >
          <VStack spacing={6}>
            <MotionBox
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Image src="/image27.png" alt="VIKAL Logo" boxSize="80px" mx="auto" />
            </MotionBox>
            <Text
              fontSize={{ base: "3xl", md: "4xl" }}
              fontWeight="extrabold"
              bgGradient="linear(to-r, white, #ffdd57)"
              bgClip="text"
              fontFamily="Orbitron, sans-serif"
            >
              VIKAL 🚀
            </Text>
            <Text fontSize={{ base: "lg", md: "xl" }} color="gray.300" fontWeight="medium" px={4}>
              Unleash Your Prep Power!
            </Text>
            <MotionBox whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                bg="#ffdd57"
                color="#0a0a0c"
                rounded="full"
                _hover={{ boxShadow: "0 0 20px rgba(255, 221, 87, 0.8)" }}
                transition="all 0.3s"
                onClick={handleGoogleSignIn}
                leftIcon={
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path
                      fill="#0a0a0c"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#0a0a0c"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#0a0a0c"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#0a0a0c"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                }
                fontSize="lg"
                fontWeight="bold"
                py={6}
                px={8}
              >
                Get Started
              </Button>
            </MotionBox>
          </VStack>
        </MotionBox>
      </MotionBox>
    );
  }

  return (
    <MotionBox
      minH="100vh"
      bgGradient="linear(to-br, #0a0a0c, #1a1b1e)"
      color="white"
      position="relative"
      overflow="hidden"
      display="flex"
      css={responseTextStyles}
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
      transition={pageTransition}
    >
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap");
      `}</style>
      <Box position="absolute" top={0} left={0} right={0} bottom={0} bg="rgba(255, 221, 87, 0.1)" filter="blur(150px)" opacity={0.3} />

      <Modal isOpen={!termsAccepted && !!user} onClose={() => {}} isCentered closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent bg="rgba(20, 20, 25, 0.9)" color="white" borderRadius="xl" maxW="md">
          <ModalHeader bgGradient="linear(to-r, white, #ffdd57)" bgClip="text" fontFamily="Orbitron, sans-serif">
            Terms and Conditions
          </ModalHeader>
          <ModalBody maxH="60vh" overflowY="auto">
            <Text fontSize="sm" lineHeight="1.6">
              <strong>Effective Date:</strong> February 27, 2025
              <br />
              <br />
              Welcome to Vikal! By using our AI-powered study platform, you agree to these Terms.
              <br />
              <br />
              <strong>1. AI-Generated Content</strong> – Vikal provides AI-generated study materials. While we strive for accuracy, users should verify information independently.
              <br />
              <br />
              <strong>2. User Responsibilities</strong> – Use Vikal for lawful educational purposes. Do not misuse or distribute content for unethical activities.
              <br />
              <br />
              <strong>3. Intellectual Property</strong> – All AI-generated content is owned by Vikal. Personal and educational use is allowed, but redistribution requires permission.
              <br />
              <br />
              <strong>4. Limitation of Liability</strong> – We are not responsible for errors or damages resulting from the use of our content.
              <br />
              <br />
              <strong>5. Third-Party Links</strong> – We may provide external links, but we do not control or endorse third-party content.
              <br />
              <br />
              <strong>6. Changes to Terms</strong> – We may update these Terms; continued use implies acceptance.
              <br />
              <br />
              <strong>7. Termination</strong> – We may suspend access for violations of these Terms.
              <br />
              <br />
              <strong>8. Governing Law</strong> – These Terms follow the laws of India.
              <br />
              <br />
              <strong>9. Contact</strong> – For inquiries, reach us at saikarthiknaidu@zovx.pro
              <br />
              <br />
              By using Vikal, you accept these Terms.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button
              bg="#ffdd57"
              color="#0a0a0c"
              rounded="full"
              _hover={{ boxShadow: "0 0 20px rgba(255, 221, 87, 0.8)" }}
              onClick={handleAcceptTerms}
            >
              Accept
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {termsAccepted && (
        <>
          <Box
            w={{ base: "full", md: "250px" }}
            p={padding}
            bg="rgba(20, 20, 25, 0.9)"
            backdropFilter="blur(12px)"
            borderRight="1px solid rgba(255, 255, 255, 0.1)"
            position={{ base: "relative", md: "fixed" }}
            top={0}
            h={{ base: "auto", md: "100vh" }}
            zIndex={2}
            display="flex"
            flexDirection="column"
          >
            <Box flexShrink={0}>
              <HStack spacing={2} mb={1}>
                <Image src="/image27.png" alt="VIKAL Logo" boxSize="95px" />
              </HStack>
              <Text fontSize="xs" color="gray.400" mb={4}>
                AI Tyari VIKAL
              </Text>
            </Box>
            <VStack spacing={4} align="stretch" flex={1} overflowY="auto">
              <MotionBox
                bg="rgba(40, 40, 45, 0.8)"
                borderRadius="md"
                p={2}
                _hover={{ bg: "rgba(60, 60, 65, 0.8)", transform: "translateY(-2px)" }}
                transition="all 0.2s"
                cursor="pointer"
                onClick={() => handlePageTransition("/summarize")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.05 }}
              >
                <HStack justify="space-between">
                  <Text fontSize="sm" color="#ffdd57">
                    Summarize YouTube
                  </Text>
                  <ChevronRightIcon color="#ffdd57" />
                </HStack>
              </MotionBox>
              <Text fontSize="sm" fontWeight="medium" color="gray.300">
                Recent 📜
              </Text>
              {chatHistory.map((chat) => (
                <MotionBox key={chat.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                  <Box
                    p={2}
                    bg="rgba(40, 40, 45, 0.8)"
                    borderRadius="md"
                    _hover={{ bg: "rgba(60, 60, 65, 0.8)", transform: "translateY(-2px)" }}
                    transition="all 0.2s"
                    cursor="pointer"
                    boxShadow="0 2px 8px rgba(0, 0, 0, 0.2)"
                    onClick={() => {
                      setSearchQuery(chat.question);
                      setResponseData({ notes: chat.response, resources: [] });
                    }}
                  >
                    <Text fontSize="xs" noOfLines={1}>
                      {chat.question}
                    </Text>
                    <Text fontSize="2xs" color="gray.500">
                      {new Date(chat.timestamp).toLocaleTimeString()}
                    </Text>
                  </Box>
                </MotionBox>
              ))}
            </VStack>
            <Box flexShrink={0} p={4} borderTop="1px solid rgba(255, 255, 255, 0.1)">
              <VStack spacing={2}>
                <HStack spacing={2}>
                  <Avatar size="xs" src={user?.photoURL ?? undefined} name={user?.displayName ?? "User"} />
                  <Text fontSize="xs" fontWeight="medium">
                    {user?.displayName}
                  </Text>
                </HStack>
                <Button
                  w="full"
                  bg="#ffdd57"
                  color="#0a0a0c"
                  rounded="full"
                  size="sm"
                  _hover={{ transform: "scale(1.03)" }}
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </VStack>
            </Box>
          </Box>

          <Box flex={1} ml={{ base: 0, md: "250px" }} p={padding} zIndex={1}>
            {showTrialEndPopup && (
              <MotionBox
                position="fixed"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                zIndex={1000}
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                bg="rgba(20, 20, 25, 0.95)"
                backdropFilter="blur(15px)"
                borderRadius="lg"
                boxShadow="0 0 40px rgba(255, 221, 87, 0.6)"
                border="3px solid #ffdd57"
                p={6}
                maxW="sm"
                textAlign="center"
              >
                <VStack spacing={4}>
                  <Text
                    fontSize="2xl"
                    fontWeight="bold"
                    bgGradient="linear(to-r, #ffdd57, white)"
                    bgClip="text"
                    fontFamily="Orbitron, sans-serif"
                  >
                    Free Trial Ended!
                  </Text>
                  <Text fontSize="md" color="gray.300">
                    Your 3 free chats are up—upgrade to Pro for unlimited access!
                  </Text>
                  <Box p={3} bg="rgba(40, 40, 45, 0.9)" borderRadius="md" border="2px solid #ffdd57">
                    <Text fontSize="lg" fontWeight="bold" color="#ffdd57">
                      ₹199/month
                    </Text>
                    <Text fontSize="sm" color="gray.400">
                      Unlimited chats & premium features
                    </Text>
                  </Box>
                  <MotionBox whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      bg="#ffdd57"
                      color="#0a0a0c"
                      rounded="full"
                      _hover={{ boxShadow: "0 0 25px rgba(255, 221, 87, 1)" }}
                      transition="all 0.3s"
                      onClick={handleUpgradeToPro}
                    >
                      Upgrade to Pro
                    </Button>
                  </MotionBox>
                  <Text fontSize="xs" color="gray.500" cursor="pointer" onClick={() => setShowTrialEndPopup(false)}>
                    Continue Free (Limited)
                  </Text>
                </VStack>
              </MotionBox>
            )}

            {isProModalOpen && !showTrialEndPopup && (
              <MotionBox
                position="fixed"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                zIndex={1000}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                bg="rgba(20, 20, 25, 0.9)"
                backdropFilter="blur(12px)"
                borderRadius="xl"
                boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                border="2px solid rgba(255, 221, 87, 0.5)"
                p={6}
                maxW="sm"
                textAlign="center"
              >
                <VStack spacing={4}>
                  <Text
                    fontSize="2xl"
                    fontWeight="extrabold"
                    bgGradient="linear(to-r, white, #ffdd57)"
                    bgClip="text"
                    fontFamily="Orbitron, sans-serif"
                  >
                    Upgrade to VIKAL Pro
                  </Text>
                  <Text fontSize="md" color="gray.300">
                    You’ve hit your 3 free chats. Go Pro for unlimited learning!
                  </Text>
                  <Box p={4} bg="rgba(40, 40, 45, 0.8)" borderRadius="md" border="1px dashed #ffdd57">
                    <Text fontSize="xl" fontWeight="bold" color="#ffdd57">
                      ₹199/month
                    </Text>
                    <Text fontSize="sm" color="gray.300">
                      - Unlimited AI chats
                      <br />
                      - Custom exam dates (soon)
                      <br />
                      - Priority support
                    </Text>
                  </Box>
                  <MotionBox whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      bg="#ffdd57"
                      color="#0a0a0c"
                      rounded="full"
                      _hover={{ boxShadow: "0 0 20px rgba(255, 221, 87, 0.8)" }}
                      transition="all 0.3s"
                      onClick={handleUpgradeToPro}
                    >
                      Go Pro Now
                    </Button>
                  </MotionBox>
                  <FormControl>
                    <FormLabel fontSize="sm" color="gray.300">
                      How’s your experience with VIKAL?
                    </FormLabel>
                    <Textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Tell us what you think!"
                      size="sm"
                      bg="rgba(50, 50, 55, 0.8)"
                      color="white"
                      border="1px solid #ffdd57"
                    />
                    <Button
                      mt={2}
                      size="sm"
                      bg="#ffdd57"
                      color="#0a0a0c"
                      rounded="full"
                      _hover={{ boxShadow: "0 0 20px rgba(255, 221, 87, 0.8)" }}
                      onClick={handleFeedbackSubmit}
                    >
                      Submit Feedback
                    </Button>
                  </FormControl>
                  <Text fontSize="xs" color="gray.500" cursor="pointer" onClick={() => setIsProModalOpen(false)}>
                    Maybe Later
                  </Text>
                </VStack>
              </MotionBox>
            )}

            <VStack align="stretch" maxW="4xl" mx="auto" spacing={6}>
              <MotionBox initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
                <HStack justify="center" spacing={0}>
                  <Image src="/image27.png" alt="VIKAL Logo" boxSize="200px" />
                  <Text fontSize="75px" color="#ffdd57" fontFamily="Orbitron, sans-serif">
                    VIKAL
                  </Text>
                </HStack>
                <Text
                  fontSize={fontSize}
                  fontWeight="extrabold"
                  textAlign="center"
                  bgGradient="linear(to-r, white, #ffdd57)"
                  bgClip="text"
                >
                  VIKAL: Your AI Prep Buddy 🤓
                </Text>
                <Text fontSize="sm" color="gray.400" textAlign="center">
                  AI Tyari VIKAL - Ace Exams & Learn Smart
                </Text>
                <Text fontSize="sm" color="gray.400" textAlign="center">
                  {localStorage.getItem("vikalPro") ? "Unlimited Chats (Pro)" : `Chats Left: ${3 - chatHistory.length}/3`}
                </Text>
              </MotionBox>

              <VStack w="full" spacing={2} mb={6}>
                <HStack justify="center" spacing={4}>
                  <HStack>
                    <InfoIcon color={isSolveMode ? "gray.500" : "#ffdd57"} />
                    <Text fontSize="sm" color={isSolveMode ? "gray.500" : "#ffdd57"}>
                      Learn
                    </Text>
                  </HStack>
                  <Switch
                    isChecked={isSolveMode}
                    onChange={(e) => setIsSolveMode(e.target.checked)}
                    colorScheme="yellow"
                    size="lg"
                  />
                  <HStack>
                    <Text fontSize="sm" color={isSolveMode ? "#ffdd57" : "gray.500"}>
                      Solve
                    </Text>
                    <AddIcon color={isSolveMode ? "#ffdd57" : "gray.500"} />
                  </HStack>
                </HStack>
                <HStack w="full" spacing={4}>
                  <Box position="relative" w="full">
                    <Input
                      placeholder={
                        isSolveMode ? "Enter your problem (e.g., Solve 2x + 3 = 7)" : "Type your topic (e.g., How does the internet work?)"
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      bg="rgba(40, 40, 45, 0.9)"
                      backdropFilter="blur(12px)"
                      border="none"
                      color="white"
                      _placeholder={{ color: "gray.500" }}
                      py={6}
                      px={6}
                      rounded="xl"
                      fontSize="md"
                      boxShadow="0 4px 16px rgba(0, 0, 0, 0.3)"
                      _focus={{ boxShadow: "0 0 0 3px rgba(255, 221, 87, 0.5)" }}
                    />
                    <IconButton
                      icon={isLoading ? <Spinner size="sm" /> : <ArrowRightIcon />}
                      bg="#ffdd57"
                      color="#0a0a0c"
                      rounded="full"
                      position="absolute"
                      right={3}
                      top="50%"
                      transform="translateY(-50%)"
                      _hover={{ transform: "translateY(-50%) scale(1.1)" }}
                      onClick={handleSearch}
                      aria-label={isSolveMode ? "Solve" : "Explain"}
                      size="md"
                    />
                  </Box>
                  {isSolveMode && (
                    <Menu>
                      <MenuButton
                        as={Button}
                        w="200px"
                        bg="rgba(50, 50, 55, 0.8)"
                        color="white"
                        rightIcon={<ChevronDownIcon />}
                        _hover={{ bg: "rgba(70, 70, 75, 0.8)" }}
                        borderRadius="md"
                        size="md"
                      >
                        {selectedExam}
                      </MenuButton>
                      <MenuList bg="rgba(40, 40, 45, 0.9)" border="none" borderRadius="md" minW="120px">
                        {exams.map((exam) => (
                          <MenuItem
                            key={exam}
                            onClick={() => setSelectedExam(exam)}
                            bg="transparent"
                            _hover={{ bg: "rgba(60, 60, 65, 0.8)" }}
                            fontSize="sm"
                          >
                            {exam}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </Menu>
                  )}
                </HStack>
                {isSolveMode && selectedExam !== "Select Exam" && (
                  <Menu>
                    <MenuButton
                      as={Button}
                      w="200px"
                      bg="rgba(50, 50, 55, 0.8)"
                      color="white"
                      rightIcon={<ChevronDownIcon />}
                      _hover={{ bg: "rgba(70, 70, 75, 0.8)" }}
                      borderRadius="md"
                      size="md"
                    >
                      {selectedStyle}
                    </MenuButton>
                    <MenuList bg="rgba(40, 40, 45, 0.9)" border="none" borderRadius="md" minW="120px">
                      {examStyles.map((style) => (
                        <MenuItem
                          key={style}
                          onClick={() => setSelectedStyle(style)}
                          bg="transparent"
                          _hover={{ bg: "rgba(60, 60, 65, 0.8)" }}
                          fontSize="sm"
                        >
                          {style}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </Menu>
                )}
              </VStack>

              <MotionBox
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                bg="rgba(40, 40, 45, 0.9)"
                borderRadius="xl"
                p={4}
                boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                border="2px dashed #ffdd57"
                textAlign="center"
                mb={6}
              >
                <Text fontSize="lg" fontWeight="bold" bgGradient="linear(to-r, white, #ffdd57)" bgClip="text" mb={3}>
                  VIKAL Live Stats 🌟
                </Text>
                <HStack justify="space-around" spacing={4}>
                  <VStack>
                    <MotionBox
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Text fontSize="2xl" fontWeight="extrabold" color="#ffdd57">
                        {stats.active_users}
                      </Text>
                    </MotionBox>
                    <Text fontSize="sm" color="gray.400">
                      Active Users
                    </Text>
                  </VStack>
                  <VStack>
                    <MotionBox
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                    >
                      <Text fontSize="2xl" fontWeight="extrabold" color="#ffdd57">
                        {stats.questions_solved}
                      </Text>
                    </MotionBox>
                    <Text fontSize="sm" color="gray.400">
                      Questions Solved
                    </Text>
                  </VStack>
                  <VStack>
                    <MotionBox
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                    >
                      <Text fontSize="2xl" fontWeight="extrabold" color="#ffdd57">
                        {stats.explanations_given}
                      </Text>
                    </MotionBox>
                    <Text fontSize="sm" color="gray.400">
                      Explanations Given
                    </Text>
                  </VStack>
                </HStack>
              </MotionBox>

              {responseData.notes && (
                <VStack spacing={6} align="stretch">
                  <MotionBox
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    bgGradient="linear(to-br, #ffdd57, #ffd700)"
                    p={6}
                    borderRadius="xl"
                    boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                    border="1px solid rgba(255, 255, 255, 0.2)"
                    whileHover={{ scale: 1.02 }}
                  >
                    <HStack justify="space-between" mb={4}>
                      <Text fontSize="lg" fontWeight="bold" color="#0a0a0c">
                        {isSolveMode ? "Solution Notes" : "Study Notes"} 🤓
                      </Text>
                      <Tooltip label={hasCopied ? "Copied!" : "Copy"} placement="top">
                        <IconButton
                          icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
                          onClick={onCopy}
                          aria-label="Copy"
                          size="sm"
                          variant="ghost"
                          color="#0a0a0c"
                          _hover={{ bg: "rgba(0, 0, 0, 0.1)" }}
                        />
                      </Tooltip>
                    </HStack>
                    <Box fontSize="md" color="#0a0a0c" lineHeight="1.6" className="response-text">
                      <ReactMarkdown>{responseData.notes}</ReactMarkdown>
                    </Box>
                  </MotionBox>

                  {responseData.examTips && (
                    <MotionBox
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      bg="rgba(30, 30, 35, 0.9)"
                      backdropFilter="blur(12px)"
                      p={6}
                      borderRadius="xl"
                      boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                      border="1px solid rgba(255, 221, 87, 0.2)"
                    >
                      <Text fontSize="lg" fontWeight="bold" bgGradient="linear(to-r, white, #ffdd57)" bgClip="text" mb={4}>
                        Points to Remember for Exam 📝
                      </Text>
                      <Box fontSize="md" color="white" lineHeight="1.6" className="response-text">
                        {responseData.examTips}
                      </Box>
                    </MotionBox>
                  )}

                  {responseData.flashcards && responseData.flashcards.length > 0 && !isSolveMode && (
                    <MotionBox
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: responseData.examTips ? 0.4 : 0.2 }}
                      bg="rgba(30, 30, 35, 0.9)"
                      backdropFilter="blur(12px)"
                      p={6}
                      borderRadius="xl"
                      boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                      border="1px solid rgba(255, 221, 87, 0.2)"
                    >
                      <Text fontSize="lg" fontWeight="bold" bgGradient="linear(to-r, white, #ffdd57)" bgClip="text" mb={4}>
                        Flashcards 📚
                      </Text>
                      <Flex wrap="wrap" gap={4}>
                        {responseData.flashcards.map((card, idx) => {
                          const colors = [
                            "linear(to-br, #4dabf7, #339af0)",
                            "linear(to-br, #40c057, #2f9e44)",
                            "linear(to-br, #cc5de8, #be4bdb)",
                            "linear(to-br, #ff878d, #ff6b6b)",
                            "linear(to-br, #74c0fc, #4dabf7)",
                          ];
                          const bgGradient = colors[idx % colors.length];
                          const [question, answer] = card.split(" - ") || [card, "No answer provided"];
                          return (
                            <MotionBox
                              key={idx}
                              w="220px"
                              h="160px"
                              bgGradient={bgGradient}
                              borderRadius="lg"
                              boxShadow="0 6px 16px rgba(0, 0, 0, 0.3)"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3, delay: idx * 0.1 }}
                              whileHover={{ rotateY: 180 }}
                              sx={{
                                transformStyle: "preserve-3d",
                                position: "relative",
                                "&:hover > div": { transform: "rotateY(180deg)" },
                                transition: "transform 0.6s",
                              }}
                            >
                              <Box position="absolute" w="100%" h="100%" css={{ transformStyle: "preserve-3d" }}>
                                <Box
                                  position="absolute"
                                  w="100%"
                                  h="100%"
                                  bgGradient={bgGradient}
                                  borderRadius="lg"
                                  p={4}
                                  css={{ backfaceVisibility: "hidden" }}
                                >
                                  <Text fontSize="sm" color="white" textAlign="center" fontWeight="bold">
                                    Q: {question}
                                  </Text>
                                </Box>
                                <Box
                                  position="absolute"
                                  w="100%"
                                  h="100%"
                                  bgGradient={bgGradient}
                                  borderRadius="lg"
                                  p={4}
                                  css={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                                >
                                  <Text fontSize="sm" color="white" textAlign="center">
                                    A: {answer}
                                  </Text>
                                </Box>
                              </Box>
                            </MotionBox>
                          );
                        })}
                      </Flex>
                    </MotionBox>
                  )}

                  <MotionBox
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.5,
                      delay: responseData.examTips && responseData.flashcards && !isSolveMode ? 0.6 : responseData.examTips || (responseData.flashcards && !isSolveMode) ? 0.4 : 0.2,
                    }}
                    bg="rgba(30, 30, 35, 0.9)"
                    backdropFilter="blur(12px)"
                    p={6}
                    borderRadius="xl"
                    boxShadow="0 8px 32px rgba(0, 0, 0, 0.5)"
                    border="1px solid rgba(255, 221, 87, 0.2)"
                  >
                    <Text fontSize="lg" fontWeight="bold" bgGradient="linear(to-r, white, #ffdd57)" bgClip="text" mb={4}>
                      Resource Hub 📖
                    </Text>
                    <VStack align="start" spacing={2} maxH="200px" overflowY="auto">
                      {responseData.resources.length > 0 ? (
                        responseData.resources.map((res, idx) => (
                          <Link
                            key={idx}
                            href={res.url}
                            isExternal
                            color="gray.300"
                            fontSize="sm"
                            _hover={{ color: "#ffdd57", textDecoration: "underline" }}
                          >
                            {res.title} <ExternalLinkIcon mx="2px" />
                          </Link>
                        ))
                      ) : (
                        <Text fontSize="sm" color="gray.500">
                          No resources available.
                        </Text>
                      )}
                    </VStack>
                  </MotionBox>
                </VStack>
              )}
            </VStack>
          </Box>
        </>
      )}
    </MotionBox>
  );
};

export default DashboardPage;
