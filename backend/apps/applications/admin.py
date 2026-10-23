from django.contrib import admin

from .models import Application, ApplicationDocument, ApplicationEvent, EnrichmentResult

# Register your models here.
admin.site.register(Application)
admin.site.register(ApplicationDocument)
admin.site.register(ApplicationEvent)
admin.site.register(EnrichmentResult)
