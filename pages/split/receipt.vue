<template>
  <App>
    <Header>
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Enter Receipt</h1>
        <NuxtLink to="/split/guests">Back</NuxtLink>
      </div>
    </Header>

    <Main>
      <Container class="py-8">
        <PageHeader title="Receipt details" description="Add receipt information so items and totals can be calculated." />

        <Card class="mt-6">
          <div class="grid gap-4">
            <Form>
              <FormField label="Merchant">
                <Input placeholder="e.g., Luigi's Pizzeria" />
              </FormField>

              <FormField label="Total">
                <InputNumber placeholder="Total amount" />
              </FormField>

              <FormField label="Date">
                <InputDate />
              </FormField>

              <FormField label="Notes (optional)">
                <Textarea placeholder="Add any notes about the receipt" />
              </FormField>

              <div class="flex justify-end gap-2 mt-4">
                <NuxtLink to="/split/guests"><Button variant="ghost">Back</Button></NuxtLink>
                <NuxtLink to="/split/items"><Button>Next: Assign items</Button></NuxtLink>
              </div>
            </Form>
          </div>
        </Card>
      </Container>
    </Main>
  </App>
</template>

<script setup>
// Scaffold for entering receipt details. Persist values to a store or route state.
</script>
