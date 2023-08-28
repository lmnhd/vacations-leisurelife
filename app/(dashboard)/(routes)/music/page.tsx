"use client";
import axios from "axios";
import * as z from "zod";
import { Heading } from "@/components/heading";
import { MessageSquare, MusicIcon } from "lucide-react";
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

//import {ChatCompletionRequestMessage} from "openai-api";
//import ChatCompletionRequestMessageRoleEnum from "openai"

const MusicPage = () => {
  const router = useRouter();
  const [music, setMusic] = useState(); // [
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
     setMusic(undefined)
     
      const response = await axios.post("/api/music",values);
     setMusic(response.data.audio);
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
        title="Music Generation"
        description=" Generate music based on your prompt."
        icon={MusicIcon}
        iconColor="text-blue-500"
        bgColor="bg-blue-500/10"
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
                        placeholder="Piano Solo"
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
              <Loader/>
            </div>
          )}

          {!music && !isLoading && (
            <div>
              <Empty label="No music generated" />
            </div>
          )}
          {music && (
            <audio controls className="w-full rounded-lg">
              <source src={music} />
            </audio>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicPage;
