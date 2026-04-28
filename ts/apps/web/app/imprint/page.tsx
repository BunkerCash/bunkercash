import { Layout } from "@/components/layout/Layout";
import { FileText, Mail } from "lucide-react";

const Imprint = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Imprint
            </h1>
            <p className="text-muted-foreground text-lg">
              Provider information and legal contact details.
            </p>
          </div>

          <div className="space-y-8">
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Provider</h2>
              </div>
              <div className="space-y-2 text-muted-foreground leading-relaxed">
                <p>BunkerCash</p>
                <p>Office 2207, Boulevard Plaza Tower 1</p>
                <p>Sheikh Mohammed Bin Rashid Boulevard</p>
                <p>Downtown Dubai, P.O. Box 334036</p>
                <p>Dubai, United Arab Emirates</p>
              </div>
            </div>

            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Contact</h2>
              </div>
              <div className="space-y-2 text-muted-foreground leading-relaxed">
                <p>Email: [contact@example.com]</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Imprint;
