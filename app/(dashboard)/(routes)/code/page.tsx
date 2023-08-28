"use client";
import axios from "axios";
import * as z from "zod";
import { Heading } from "@/components/heading";
import { Code2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Empty } from "@/components/empty";
import { UserAvatar } from "@/components/user-avatar";
import { BotAvatar } from "@/components/bot-avatar";
import { useRouter } from "next/navigation";
import { formSchema } from "./constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import OpenAI from "openai";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/loader";
import ReactMarkdown from "react-markdown";

//import {ChatCompletionRequestMessage} from "openai-api";
//import ChatCompletionRequestMessageRoleEnum from "openai"

const CodePage = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]); // [
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
    },
  });
  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    //console.log(values);
    try {
      const userMessage = {
        role: "user",
        content: values.prompt,
      };
      const newMessages = [...messages, userMessage];
      const response = await axios.post("/api/code", {
        messages: newMessages,
      });
      console.log(response.data);

      setMessages((current: any) => [
        ...current,
        userMessage,
        response.data.message,
      ]);

      form.reset();
    } catch (error) {
      console.log(error);
    } finally {
      router.refresh();
    }
    //console.log(values);
  };

  return (
    <div>
      <Heading
        title="Code Generation"
        description="Generate code from natural language."
        icon={Code2}
        iconColor="text-green-700"
        bgColor="bg-green-700/10"
      />
      <div className="px-4 lg:px-8">
        <div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid w-full grid-cols-12 gap-2 p-4 px-3 border rounded-lg md:px-6 focus-within:shadow-sm"
            >
              <FormField
                name="prompt"
                render={({ field }) => (
                  <FormItem className="col-span-12 lg:col-span-10">
                    <FormControl className="p-0 m-0">
                      <Input
                        className="border-0 outline-none focus-visible:ring-0 focus-visible:ring-transparent"
                        disabled={isLoading}
                        placeholder="Simple toggle button using react hooks"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                className="w-full col-span-12 lg:col-span-2"
                disabled={isLoading}
              >
                Generate
              </Button>
            </form>
          </Form>
        </div>
        <div className="mt-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center w-full rounded-lg p- bg-muted">
              <Loader />
            </div>
          )}

          {messages.length === 0 && !isLoading && (
            <div>
              <Empty label="Start a conversation by typing a message above." />
            </div>
          )}
          <div className="flex flex-col gap-y-4">
            {messages.map((message: any, index: number) => (
              <div
                className={cn(
                  "p-8 w-full flex items-start gap-x-8 rounded-lg",
                  message.role === "user"
                    ? "bg-white border border-black/10"
                    : "bg-muted"
                )}
                key={index}
              >
                {message.role === "user" ? <UserAvatar /> : <BotAvatar />}
                <ReactMarkdown 
                components={{
                  pre: ({node, ...props}) => 
                  <div className="overflow-auto w-full my-2 bg-black/10 p-2 rounded-lg">
                    <pre {...props} />
                  </div>,
                  code: ({node, ...props}) => (
                    <code className="bg-black/10 rounded-lg" {...props}/>
                  )
                }}
                className="text-sm">
                  
                  {message.content || ""}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodePage;
