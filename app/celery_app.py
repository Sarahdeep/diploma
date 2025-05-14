from celery import Celery

celery = Celery(__name__, broker="redis://redis:6379/0")

@celery.task
def train_model():
    # Заглушка: логирование в консоль
    print("Training model...")
    return "Model trained (stub)"